let LOG = false;
let t0 = 0;
let t1 = 0;

// REDRAW CONTROL_PLOT ONLY IF NEEDED!!! VERY IMPORTANT

// REMOVE: this.scaleMax;
// REMOVE: this.yScale?
// REMOVE: drawColumns or ???

// STORE DIFF (MAX - MIN);

// REFACTOR COLUMN OR AT LEAST CONCAT PREPARE COLUMN, PROCESS COLUMN AND GETMINMAXVALUES;

// CACHE SIN AND COS IN ZOOM ANIMATION OF LAST CHART <-- LOW PRIORITY

// REFACTOR DATES

// Optimize: math.round, math.floor, math.ceil to bitwise operations;
// Optimize: zoomEase

const EZoomType = {
  line: 1,
  bar: 2,
  area: 3,
  stacked: 4,
};


class Chart2 {
  constructor(el, data, colorTheme) {
    this.data = data;

    this.rootEl = el;
    el.innerHTML = this.rootHTML();

    const DPI = window.devicePixelRatio;

    const chartCanvas = el.querySelector('[data-selector=chart]');
    const chartValuesCanvas = el.querySelector('[data-selector=chartValues]');
    const popupEl = el.querySelector('.popup');
    const chartControlsCanvas = el.querySelector('[data-selector=chartControls]');
    this.columnSelector = el.querySelector('.column-selector');

    const titleEl = el.querySelector('.chart-header h2');
    const valueEl = el.querySelector('.chart-header .value');


    this.plot = new Plot2(chartCanvas, chartValuesCanvas, chartControlsCanvas, {
      DPI,
      popupEl,
      holderEl: el,
      font: `${14 * DPI}px Arial`,
      leftSubstrateEl: el.querySelector('.substrate-left'),
      rightSubstrateEl: el.querySelector('.substrate-right'),
      rectEl: el.querySelector('.rect'),
      titleEl,
      valueEl,
    });

    this.setTheme(colorTheme);
    this.init();
    this.renderBind = this.render.bind(this);
    requestAnimationFrame(this.renderBind);
  }

  init() {
    this.plot.setChartData(this.data);
    this.plot.left = 0.75;
    this.plot.right = 1;

    this.columnSelector.addEventListener('change', this.handleColumnSelectorChange)
  }

  setTheme(theme) {
    this.plot.setTheme(theme);
  }

  resize() {
    this.plot.resize();
  }

  handleColumnSelectorChange = (event) => {
    const targetLabel = event.target.dataset.label;
    let activeColumns = 0;
    let switchColumn;

    for (let i = 0, col; i < this.data.columns.length; i++) {
      col =  this.data.columns[i];
      activeColumns += Number(col.active);
      if (col.label === targetLabel) {
        switchColumn = col;
      }
    }

    if (switchColumn) {
      let toggle = !switchColumn.active;

      if (!toggle && activeColumns < 2) {
        toggle = true;
      }

      switchColumn.active = toggle;
      event.target.checked = toggle;
    }
  };

  rootHTML() {
    return `
      <div class="chart-wrapper">
        <div class="chart-header">
          <h2></h2>
          <div class="value"></div>
        </div>
        <div class="chart-holder">
          <canvas data-selector="chart"></canvas>
          <canvas class="chart-values" data-selector="chartValues"></canvas> 
          <div class="popup"></div>
        </div>
        <div class="chart-controls-holder">
            <canvas data-selector="chartControls"></canvas>
            <div class="control substrate substrate-left"></div>
            <div class="control substrate substrate-right"></div>
            <div class="control rect"></div>
        </div>
        <div class="column-selector">${this.columnSelectorHTML()}</div>
      </div>
    `;
  }

  columnSelectorHTML() {
    return this.data.columns.map(({name, label, color}) => `
      <div>
        <label>
        <input type="checkbox" data-label="${label}" checked />
        <span class="checkbox-icon" style="color: ${color};"></span>
        <span class="text">${name}</span>
        </label>
      </div>
    `
    ).join('');
  }

  render(dt) {
    t0 = performance.now();
    const s = t0;
    this.plot.render(dt);
    t1 = performance.now();
    LOG && console.log(this.data.id + ' main chart render:', t1 - t0);
    LOG && console.error(this.data.id + 'TOTAL', t1 - s);
    requestAnimationFrame(this.renderBind);
  }

}

// Class to render chart values
class Plot2 {
  static DATA_TEXTURE_SIZE = 32;
  static DATA_TEXTURE_LEVEL = 0;
  static VERTEX_SHADER_SRC = '';
  static FRAGMENT_SHADER_SRC = '';
  static TIME_FORMAT = new Intl.DateTimeFormat('en-us', {day: 'numeric', month: 'short'});
  static DATE_FORMAT = new Intl.DateTimeFormat('en-us', {weekday: 'short', day: 'numeric', month: 'short'});
  static ZOOM_FORMAT = new Intl.DateTimeFormat('en-us', {timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false});
  static VALUE_FORMAT = new Intl.DateTimeFormat('en-us', {timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'});
  static ZOOM_VALUE_FORMAT = new Intl.DateTimeFormat('en-us', {timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  static DATE_WIDTH = 20;
  static MIN_DIFF = 0;//0.05;

  static DEFAULT_OPTIONS = {
    DPI: window.devicePixelRatio,
    animationTime: 400, // 600

    popupEl: null,

    lineWidth: 2,
    controlLineWidth: 1,
    lineSmooth: 1,

    scaleThickness: 1,
    scaleCount: 6,
    scaleOffsetX: 20,

    selectedCircleRadius: 5,

    font: '',
    padding: 20,

    rectTopThickness: 2,
    rectLeftThickness: 7,
  };

  constructor(canvasEl, canvasValuesEl, canvasControlEl, options) {
    this.canvasPos = canvasEl.getBoundingClientRect();
    this.controlCanvasPos = canvasControlEl.getBoundingClientRect();

    this.options = Object.assign({}, Plot2.DEFAULT_OPTIONS, options);

    this.holderEl = this.options.holderEl;

    this.leftSubstrateEl = this.options.leftSubstrateEl;
    this.rectEl = this.options.rectEl;
    this.rightSubstrateEl = this.options.rightSubstrateEl;

    // For resize:
    // this.chartWidth = this.canvasPos.width - this.options.padding * 2;
    // this.chartOffset = this.options.padding / this.chartWidth;

    this.DPI = this.options.DPI;



    canvasEl.width = this.canvasPos.width * this.DPI;
    canvasEl.height = this.canvasPos.height * this.DPI;

    this.ctxMain = canvasEl.getContext('2d');

    canvasControlEl.width = this.controlCanvasPos.width * this.DPI;
    canvasControlEl.height = this.controlCanvasPos.height * this.DPI;

    this.ctxControl = canvasControlEl.getContext('2d');

    this.plotDrawer = new PlotDrawer(this.ctxMain, this.options.padding, this.DPI);
    this.controlPlotDrawer = new PlotDrawer(this.ctxControl, 0, this.DPI);

    // this.width = this.ctxMain.canvas.width;
    // this.height = this.ctxMain.canvas.height;

    this.yScale = new Array(4);
    this.lineColor = new Array(4 * 3);
    this.lineOpacity = new Array(4);
    this.lineDraw = new Array(4);

    this.yScale.fill(0);
    this.lineColor.fill(0);
    this.lineOpacity.fill(0);
    this.lineDraw.fill(false);


    this.positionLeft = 0;
    this.positionRight = 1;

    this.animationsCount = 0;


    /*   this.animation = false;
       this.isPositiveAnimation = false;
       this.targetMaxValue = 0;
       this.startAnimation = 0;
       this.dMaxvalue = 0;*/

    this.tweenZoom = new Tween();
    this.tweenRectLeft = new Tween();
    this.tweenRectRight = new Tween();

    this.tweenScales = new Tween();

    this.maxValue = [0,0]; // TODO: del
    this.minValue = [0,0]; // TODO: del

    this.currMaxValue = [0,0];
    this.currMinValue = [0,0];
    this.tweenMaxValue = [new Tween(), new Tween()];
    this.tweenMinValue = [new Tween(), new Tween()];

    this.currMaxValueZoom = [0, 0];
    this.currMinValueZoom = [0, 0];
    this.tweenMaxValueZoom = [new Tween(), new Tween()];
    this.tweenMinValueZoom = [new Tween(), new Tween()];


    this.tweenCircle = new Tween(); // for pie chart animation

    this.activeColumns = {};
    this.animatedColumns = {};

    this.diff = 0;
    this.scale = 1;
    this.xOffset = 0;
    this.totalItemsInFrame = 0;
    this.step = 1;

    this.bgColor = [0, 0, 0];

    this.drawDateItems = {};
    this.drawDateItemsAnimations = {};

    this.renderState = {};

    this.zoom = false;
    this.zoomItem = 0;
    this.zoomData = {};

    this.controlPlot = {};


    this.init(this.options);

    this.initInteractive();

  //  if (canvasValuesEl) {
     // this.initValues(canvasValuesEl, options.font);
    //}
  }

  init(options) {
    this.scaleMax = [0, 0]; // TODO: DEL!
    this.scaleDraw = [0, 0];
    this.scaleStep = [1, 1];
    this.scaleOpacity = [1, 1];

    this.mousePos = [-1, -1];

    this.lineWidth = options.lineWidth * this.DPI;
    this.controlLineWidth = options.controlLineWidth * this.DPI;

    this.scaleWidth = options.scaleThickness * this.DPI;
    this.scaleOffsetX = options.scaleOffsetX * this.DPI;
    this.scaleCount = options.scaleCount;
  }

  initValues(canvas, font) {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * this.DPI;
    canvas.height = r.height * this.DPI;
    this.ctx = canvas.getContext('2d');
    this.ctx.font = font;

    this.dateBasis = 0;
    this.leftItemData = 0;
    this.rightItemDate = 0;
    this.startItemDate = 0;

    this.initInteractive(canvas);
  }

  handleMouseMove = (event) => {
    this.mousePos = [getPageX(event) - this.canvasPos.left, getPageY(event) - this.canvasPos.top];
  };

  handleMouseOut = () => {
    this.mousePos = [-100, -100];
  };

  initInteractive(canvas) {
    this.holderEl.addEventListener('mousemove', this.handleMouseMove);
    this.holderEl.addEventListener('touchmove', this.handleMouseMove);
    this.holderEl.addEventListener('mouseout', this.handleMouseOut);
    this.holderEl.addEventListener('touchend', this.handleMouseOut);

    this.popup = new Popup(this.options.popupEl, this.handlePopupClick);

    this.left = 0;
    this.right = 1;

    this.drag = '';
    this.startDragPos = 0;
    this.startLeft = 0;
    this.startRight = 1;

    this.ctxControl.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.ctxControl.canvas.addEventListener('touchstart', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleDocMouseMove);
    document.addEventListener('touchmove', this.handleDocMouseMove);
    document.addEventListener('mouseup', this.handleDocMouseUp);
    document.addEventListener('touchend', this.handleDocMouseUp);

    this.options.titleEl.addEventListener('click', this.handleZoomOut);

  }

  //TODO: DEL
  setPosition(left, right) {
    const diff = right - left;
    this.xOffset = left / diff;
    // this.ctxMain.uniform1f(this.uniforms.xOffset, this.xOffset);
    //
    if (diff !== this.diff) {
      this.diff = diff;
      this.scale = 1 / diff;
      this.step = this.scale * this.chartData.step;
      this.totalItemsInFrame = 1 / this.step;
    }

    let dateBasis =  this.plotDrawer.totalItemsInFrame / (this.canvasPos.width / (Plot2.DATE_WIDTH * 8)) >> 0;

    if (dateBasis % 2) {
      dateBasis--;
    }

    if (!this.dateBasis) {
      this.dateBasis = dateBasis;
    } else if (this.dateBasis !== dateBasis) {
      const increase = dateBasis > this.dateBasis;

      if (increase ? dateBasis / this.dateBasis >= 2 : this.dateBasis / dateBasis >= 2) {
        if (increase) {
          this.dateBasis *= 2;
        } else {
          this.dateBasis /= 2;
        }

        this.dateBasis = Math.ceil(this.dateBasis);
        this.dateBasisChange = true;


        if (this.leftItemData && left === this.positionLeft) {
          this.startItemDate = this.leftItemData % this.dateBasis;
        } else if (this.rightItemDate && right === this.positionRight) {
          this.startItemDate = this.rightItemDate % this.dateBasis;
        } else {
          this.startItemDate = 0;
        }
      }
    }


    if (
      this.plotDrawer.leftItem !== this.renderState.leftItem ||
      this.plotDrawer.rightItem !== this.renderState.rightItem
    ) {
      this.updateHeader();
    }

  }

  handleMouseDown = (event) => {
    const pageX = getPageX(event);
    const offset = pageX - this.controlCanvasPos.left;

    const rectPositionLeft = (this.left - this.controlPlotDrawer.positionLeft) / this.controlPlotDrawer.diff * this.controlCanvasPos.width;
    const rectPositionRight = (this.right - this.controlPlotDrawer.positionLeft) / this.controlPlotDrawer.diff * this.controlCanvasPos.width;

    if (Math.abs(rectPositionLeft - offset) < 20) {
      this.drag = 'left';
    }

    if (Math.abs(rectPositionRight - offset) < 20) {
      this.drag = 'right';
    }

    if (!this.drag && offset > rectPositionLeft && offset < rectPositionRight) {
      this.drag = 'center';
    }

    if (this.drag) {
      this.startDragPos = pageX;
      this.startLeft = this.left;
      this.startRight = this.right;
    }
  };

  handleDocMouseMove = (event) => {
    if (!this.drag) {
      return;
    }

    const delta = getPageX(event) - this.startDragPos;
    const normDelta = delta / this.controlCanvasPos.width * this.controlPlotDrawer.diff;

    let left = this.startLeft;
    let right = this.startRight;

    switch (this.drag) {
      case 'left':
        left = Math.max(this.controlPlotDrawer.positionLeft, this.startLeft + normDelta);
        break;
      case 'right':
        right = Math.min(this.controlPlotDrawer.positionRight, this.startRight + normDelta);
        break;
      case 'center':
        left = Math.max(this.controlPlotDrawer.positionLeft, this.startLeft + normDelta);
        right = Math.min(this.controlPlotDrawer.positionRight, this.startRight + normDelta);
        break;
    }

    if (right - left >= Plot2.MIN_DIFF) {
      this.left = left;
      this.right = right;
    }
  };

  handleDocMouseUp = () => {
    this.drag = '';
  };

  setTheme({ bgColor, scaleColor, textColor, mouseLineColor, rectColor, substrateColor }) {

    this.mouseLineColor = mouseLineColor;
    this.scaleColor = scaleColor;
    this.bgColor = bgColor;
    this.textColor = textColor;

    this.rectColor = rectColor;
    this.substrateColor = substrateColor;

    // TODO: TEXT COLOR;
    // this.ctx && (this.ctx.fillStyle = textColor);

    this.animationsCount++; // for force render;
  }

  setChartData(chartData) {
    this.chartData = chartData;
    this.tweenColumns = new Array(chartData.columns.length).fill(new Tween());
    this.tweenArcs = new Array(chartData.columns.length).fill(new Tween());

    this.activeColumns = chartData.columns.reduce((acc, {label, active}) => {
      acc[label] = active;
      return acc;
    }, {});

    this.firstRender = true;

    this.leftItem = 0;
    this.rightItem = chartData.length - 1;

    this.plotDrawer.setChartData(chartData);
    this.controlPlotDrawer.setChartData(chartData);

    this.controlPlotDrawer.setPosition(0,1);

    this.options.titleEl.textContent = chartData.name;

    this.updateHeader();

  }


  prepareDates() {

  }

  resize() {
    // this.canvasPos = this.ctxMain.canvas.getBoundingClientRect();
    // this.controlCanvasPos = this.ctxControl.canvas.getBoundingClientRect();
    // this.ctxMain.canvas.width = this.canvasPos.width * this.DPI;
    // this.ctxControl.canvas.width = this.controlCanvasPos.width * this.DPI;
    // this.chartWidth = this.canvasPos.width - this.options.padding * 2;
    // this.chartOffset = this.options.padding / this.chartWidth;
    this.plotDrawer.resize();
    this.controlPlotDrawer.resize();

    this.animationsCount ++ ;

    // this.width = this.ctxMain.canvas.width;
    // this.height = this.ctxMain.canvas.height;

    this.ctxMain.font = this.options.font;

    this.dateBasis = this.totalItemsInFrame / (this.canvasPos.width / (Plot2.DATE_WIDTH * 8)) >> 0;
    if (this.dateBasis % 2) {
      this.dateBasis--;
    }

   /* if (this.ctx) {
      this.ctx.canvas.width = this.canvasPos.width * this.DPI;
      this.ctx.font = this.options.font;
      this.ctx.fillStyle = this.textColor;
      this.dateBasis = this.totalItemsInFrame / (this.canvasPos.width / (Plot2.DATE_WIDTH * 8)) >> 0;
      if (this.dateBasis % 2) {
        this.dateBasis--;
      }
    }*/
  }

  // getLeftItem() {
  //   return this.totalItemsInFrame * this.xOffset - this.chartOffset / this.step;
  // }

  // getRightItem() {
  //   return this.getLeftItem() +  this.totalItemsInFrame + 2 * this.chartOffset / this.step;
  // }

  getSelectedItem(zoom) {
    const mouseX = this.mousePos[0];

    if (mouseX < 0) {
      return null;
    }

    const selectedItem = zoom
      ? this.plotDrawer.getItemOnPositionZoom(mouseX)
      : this.plotDrawer.getItemOnPosition(mouseX);


    if (selectedItem < 0 || selectedItem > (zoom ? this.zoomData.length - 1 : this.chartData.length - 1)) {
      return null;
    }

    return selectedItem;
  }

  formatValue(v) {
    if (v >= 1000000) {
      const r = v / 1000000;
      const temp = r.toFixed(2);
      const m1 = temp[temp.length - 2] !== '0';
      const m2 = temp[temp.length - 1] !== '0';
      return r.toFixed(m2 ? 2 : m1 ? 1 : 0) + 'm';
    }

    if (v > 10000) {
      return (v / 1000 >> 0) + 'k';
    }

    return v;

  }

  processColumn(column, index, maxValue, dt) {
    this.yScale[index] = column.max / maxValue;

    let opacity = 1;



    const animation = this.animatedColumns[column.label];
    if (animation) {
      const animationPosition = (dt - animation.start) / this.options.animationTime; // COLUMN ANIMATION

      if (animationPosition >= 1) {
        delete this.animatedColumns[column.label];
        opacity = column.active ? 1 : 0;
      } else {
        this.animationsCount ++ ;
        opacity = column.active ? animationPosition : 1 - animationPosition;
      }
    }

    if (this.tweenColumns[index].inProgress) {
      opacity = this.tweenColumns[index].value;
    }


    this.lineOpacity[index] = opacity;
    this.lineDraw[index] = opacity > 0;

    // In stacked charts yScale === opacity;
    if (this.chartData.stacked) {
      this.yScale[index] = opacity;

      if (this.chartData.percentage) {
        for (let i = column.values.length; i--;) {
          this.sums[i] += column.values[i] * opacity;
        }
      }
    }
  }

  processSelection() {
    this.selectedItem = this.getSelectedItem();
    this.drawSelected = this.selectedItem !== null;
    this.selectedItemPix = this.drawSelected
      ? this.plotDrawer.getItemPositionPix(this.selectedItem)
      : 0;

    if (this.zoom && this.zoomType !== EZoomType.area) {
      this.selectedItemZoom = this.getSelectedItem(true);
      this.selectedItemZoomPix = this.selectedItemZoom !== null
        ? this.plotDrawer.getItemPositionPixZoom(this.selectedItemZoom)
        : 0;
    }
  }

  // TODO refactor and concat with prepare columns
  getMinMaxValues(data, drawColumns, leftItem, rightItem) {
  // TODO: FOR MIN VALUES:
  // Y POINT = (value - min) / (max - min);

    const max = [0, 0];
    const min = [0, 0];

    let column;
    let minmax = [0,0];


    // Find area:
    if (data.percentage) {
      for (let i = 0; i < data.columns.length; i++) {
        column = data.columns[i];

        if (this.animatedColumns[column.label] || column.active) {
          drawColumns[column.label] = true;
        }
      }

      max[0] = 120;

    // find stacked
    } else if (data.stacked) {

      const totalItems = rightItem- leftItem + 1;
      const sums = new Array(totalItems).fill(0);

      for (let i = 0; i < data.columns.length; i++) {
        column = data.columns[i];

        if (this.animatedColumns[column.label] || column.active) {
          drawColumns[column.label] = true;
        }

        if (!column.active) {
          continue;
        }

        for (let j = leftItem, c = 0; j <= rightItem; j++, c++) {
          sums[c] += column.values[j];
        }

      }

      const res = this.calcMaxValue(Math.max.apply(null, sums));
      max[0] = res;
    // find line
    } else {
      min[0] = min[1] = 9999999999;

      // Find current maximun
      for (let i = 0; i < data.columns.length; i++) {
        column = data.columns[i];

        if (this.animatedColumns[column.label] || column.active) {
          drawColumns[column.label] = true;
        }

        if (!column.active) {
          continue;
        }

        minmax = this.getMinMaxValueInPosition(
          column.values,
          leftItem,
          rightItem,
          column.max
        );

        if (data.yScaled) {
          max[i] = minmax[1];
          min[i] = minmax[0];
        } else {
          max[0] = minmax[1] > max[0] ? minmax[1] : max[0];
          min[0] = minmax[0] < min[0] ? minmax[0] : min[0];
        }
      }
    }

    minmax = this.roundValues(min[0], max[0]);

    min[0] = minmax[0];
    max[0] = minmax[1];

    if (data.yScaled) {
      minmax = this.roundValues(min[1], max[1]);
      min[1] = minmax[0];
      max[1] = minmax[1];
    }

    return { min, max };
  }

  getMinMaxValueInPosition(values, leftItem, rightItem, maxValue) {
    let max = 0;
    let min = maxValue;
    for (let i = leftItem; i <= rightItem; i++) {
      max = values[i] > max ? values[i] : max;
      min = values[i] < min ? values[i] : min;
    }

    return [min, max];
  }

  // TODO: del this piece of shit;
  calcMaxValue(val) {
    let k;
    let res;
    if (val < 1000) {
      k = val / 6 + 0.3 >> 0;
      k += 3;
      if (val < 100) k -= 2;
      res = k * 6;
    } else {
      const l = val.toString().length;
      k = 6 * Math.pow(10, l - 2);
      const t = val / k + 0.3 >> 0;
      res = (t + 1) * k;
    }
    return res;
  }

  roundValues(min, max) {
    const diff = max - min;
    const offset = diff * 0.02;
    let roundMin = roundInt(min - offset >> 0, 0);
    roundMin = roundMin < 0 ? 0 : roundMin;
    const roundStep = roundInt(((max + offset) - roundMin) / 6 >> 0, 1);
    return [roundMin, roundMin + roundStep * 6];
  }

  drawScaleValues(min, diff, scaleStep, opacity) {
    const ctx = this.ctxMain;
    // const ctx = this.ctx;

    const height = scaleStep * 6;
    const step = diff / 6;
    const textOffset = height / 6;

    ctx.globalAlpha = opacity;

    for (let i = 6; i--;) {
      ctx.fillText(this.formatValue(min + i * step), 20 * this.DPI, this.ctxMain.canvas.height - i * textOffset - 5);
    }
  }

  // TODO: refactor ??
  drawDates(dt) {
    const ctx = this.ctxMain;
    // const ctx = this.ctx;

    ctx.globalAlpha = 1;

    let firstItem = true;
    let d;

    const drawDateItems = {};

    let i = Math.round(Math.max( this.startItemDate, this.plotDrawer.leftItemAbs - this.totalItemsInFrame / 2));
    i -= i % this.dateBasis;
    if (this.startItemDate) {
      i -= i % this.startItemDate;
    }
    let x;

    for (i; i < this.chartData.length; i += this.dateBasis) {
      x = this.plotDrawer.getItemPositionPix(i);

      if (x < -this.canvasPos.width / 2) { continue; }
      if (x > this.canvasPos.width) { break; }
      if (firstItem) {
        this.leftItemData = i;
        firstItem = false;
      }

      delete this.drawDateItemsAnimations[i];

      if (this.drawDateItems[i]) {
        d = Math.min(1, (dt - this.drawDateItems[i]) / 400);
        d < 1 && this.animationsCount ++ ;
        drawDateItems[i] = this.drawDateItems[i];
        delete this.drawDateItems[i];
      } else {
        drawDateItems[i] = this.dateBasisChange ? dt : 1;
        d = this.dateBasisChange ? 0 : 1;
      }

      ctx.globalAlpha = d;
      x -= Plot2.DATE_WIDTH;

      this.rightItemDate = i;

      ctx.fillText(
        Plot2.TIME_FORMAT.format(this.chartData.timestamps[i]),
        x * this.DPI,
        ctx.canvas.height - 10
      );
    }

    this.dateBasisChange = false;

    Object.keys(this.drawDateItemsAnimations).forEach(i => {
      const d = Math.max(0, dt - this.drawDateItemsAnimations[i]) / 400;

      if (d >= 1) {
        delete this.drawDateItemsAnimations[i];
        return;
      }

      this.animationsCount ++;

      const x = this.plotDrawer.getItemPositionPix(i) - Plot2.DATE_WIDTH;
      ctx.globalAlpha = 1 - d;

      ctx.fillText(
        Plot2.TIME_FORMAT.format(this.chartData.timestamps[i]),
        x * this.DPI,
        ctx.canvas.height - 10
      );
    });

    Object.keys(this.drawDateItems).forEach(i => {
      if (this.drawDateItemsAnimations[i]) {
        return;
      }

      this.drawDateItemsAnimations[i] = dt /*+ 200 */;

      const x = this.plotDrawer.getItemPositionPix(i) - Plot2.DATE_WIDTH;
      ctx.fillText(
        Plot2.TIME_FORMAT.format(this.chartData.timestamps[i]),
        x * this.DPI,
        ctx.canvas.height - 10
      );
    });

    this.drawDateItems = drawDateItems;
  }

  prepareColumns(dt) {
    for (let i = 0, column; i < this.chartData.columns.length; i++) {
      column = this.chartData.columns[i];

      if (column.active !== this.activeColumns[column.label]) {
        this.activeColumns[column.label] = column.active;
        this.animatedColumns[column.label] = {
          start: dt,
        };
        this.animationsCount ++ ;
      }
    }
  }


  processCritValue(dt, tween, nextVal) {
    if (tween.targetValue !== nextVal) {
      tween.to(tween.value, nextVal, dt, this.options.animationTime);

      this.tweenScales.to(0, 1, dt, this.options.animationTime);
      //TODO: this.tweenScales ?
    } else if (tween.inProgress) {
      tween.stepTime(dt);
    }
  }

  processMinMaxValues(dt) {
    const max0 = this.zoom ? this.tweenMaxValueZoom[0] : this.tweenMaxValue[0];
    const max1 = this.zoom ? this.tweenMaxValueZoom[1] : this.tweenMaxValue[1];
    const min0 = this.zoom ? this.tweenMinValueZoom[0] : this.tweenMinValue[0];
    const min1 = this.zoom ? this.tweenMinValueZoom[1] : this.tweenMinValue[1];

    const { max, min } = this.getMinMaxValues(
      this.zoom ? this.zoomData : this.chartData,
      {},
      this.zoom ? 0 : this.plotDrawer.leftItem,
      this.zoom ? this.zoomData.length - 1 : this.plotDrawer.rightItem,
      );

    if (!this.tweenMaxValue[0].value) {
      max0.to(max[0], max[0]);
      max1.to(min[0], min[0]);
      min0.to(max[1], max[1]);
      min1.to(min[1], min[1]);
    } else {
      this.processCritValue(dt, max0, max[0]);
      this.processCritValue(dt, min0, min[0]);

      if (this.chartData.yScaled) {
        this.processCritValue(dt, max1, max[1]);
        this.processCritValue(dt, min1, min[1]);
      }
    }

    this.tweenScales.stepTime(dt);


    /*

    // this.currMaxValue[1] = max[1];
    //this.currMinValue[0] = min[0];

    this.currMinValue[1] = min[1];
    this.currMaxValue[1] = max[1];


    if (this.currMaxValue[0] !== max[0] && max[0] !== this.tweenMaxValue[0].targetValue) {

      if (!this.maxValue[0]) {
        this.maxValue[0] = max[0];
        this.minValue[0] = min[0];
      } else {
        // this.animation = true;

        this.tweenMaxValue[0].to(this.currMaxValue[0], max[0], dt, this.options.animationTime);
        this.tweenMinValue[0].to(this.currMinValue[0], min[0]);

        this.scaleMax = [this.maxValue[0], max[0]];
      }
    }

    const baseScaleStep = this.ctxMain.canvas.height / this.options.scaleCount;

    // process animation (scales)
    if (this.tweenMaxValue[0].inProgress) {
      this.currMaxValue[0] = this.tweenMaxValue[0].stepTime(dt);
      this.currMinValue[0] = this.tweenMinValue[0].stepTime(dt);

      if (this.tweenMaxValue[0].complete) {
        this.maxValue[0] = this.currMaxValue[0];
        this.minValue[0] = this.currMinValue[0];
      } else {
        this.animationsCount ++ ;
        this.scaleDraw = [1, 1];

        const p = this.tweenMaxValue[0].position;

        this.scaleStep = [
          this.tweenMaxValue[0].isPositive ? baseScaleStep * (1 - p) : baseScaleStep * (1 + p),
          this.tweenMaxValue[0].isPositive ? baseScaleStep * (1 + (1 - p)) : baseScaleStep * p,
        ];
        this.scaleOpacity = [
          1 - p,
          p
        ];
      }
    }

    // Prepare data for scales
    if (this.tweenMaxValue[0].complete) {
      this.currMaxValue[0] = this.maxValue[0];
      this.currMinValue[0] = this.minValue[0];
      this.scaleMax = [this.maxValue[0], 0];
      this.scaleOpacity = [1, 1];
      this.scaleDraw = [1, 0];
      this.scaleStep = [baseScaleStep, baseScaleStep];
    }

    */

  }

  storeRenderState() {
    this.renderState = {
      positionLeft: this.positionLeft,
      positionRight: this.positionRight,
      mouseX: this.mousePos[0],
      left: this.left,
      right: this.right,
      leftItem: this.plotDrawer.leftItem,
      rightItem: this.plotDrawer.rightItem,
    }
  }

  shouldRender() {
    return (
      this.tweenScales.inProgress ||
     // !this.maxValue[0] ||  // is first draw
      this.animationsCount || // is any animation
      this.positionLeft !== this.renderState.positionLeft ||
      this.positionRight !== this.renderState.positionRight ||
      this.mousePos[0] !== this.renderState.mouseX ||
      this.left !== this.renderState.left ||
      this.right !== this.renderState.right
    );
  }

  render(dt) {
    this.dt = dt;

    if (this.tweenZoom.inProgress) {
      this.animationsCount ++ ;

      const position = this.tweenZoom.stepTime(this.dt);

      this.zoomFactor = 1 + position * this.chartData.length;

      if (this.zoomType === EZoomType.area) {
        this.plotDrawer.processZoomAnimation(position * 2);

        if (position >= 0.5) {

        }

      }

      if (this.zoomType === EZoomType.line) {
        this.plotDrawer.processZoomAnimation(position);
        this.controlPlotDrawer.processZoomAnimation(position);

        this.left = this.tweenRectLeft.step(this.controlPlotDrawer.zoomAnimationPositionEase);
        this.right = this.tweenRectRight.step(this.controlPlotDrawer.zoomAnimationPositionEase);
      }

      if (this.zoomType === EZoomType.bar) {
        this.plotDrawer.processZoomAnimation(position);
        this.tweenColumns.forEach(tween => tween.step(position));
      }

      if (this.tweenZoom.complete) {
        if (this.tweenZoom.targetValue) { // zoomIn
          this.left = this.tweenRectLeft.targetValue;
          this.right = this.tweenRectRight.targetValue;
        } else { // zoomOut
          this.left = this.tweenRectLeft.startValue;
          this.right = this.tweenRectRight.startValue;
          this.zoom = false;
          this.updateHeader();
        }

      }

     /* if (this.tweenZoom.complete) {
        console.log('end');
        console.log(this.left, this.right, this.leftItem, this.rightItem);
      } */
    } else {
      this.plotDrawer.setPosition(this.left, this.right);
      this.setPosition(this.left, this.right);
    }

    this.prepareDates();
    this.prepareColumns(dt);

    if (!this.shouldRender()) {
      return;
    }

    this.animationsCount = 0;
    let drawColumns = {};
    let i;

    drawColumns = this.chartData.columns.reduce((a, { label } ) => {a[label] = true; return a}, {}); // TODO: fix!

    // TODO: hack.
    if (!(this.zoom && this.zoomType === EZoomType.area)) {
      this.processMinMaxValues(dt);
    }

    this.lineDraw = new Array(this.chartData.columns.length).fill(false);

    // process columns and draw each
    if (this.chartData.percentage) {
      this.sums = new Array(this.chartData.length).fill(0);
    }

    for (i = 0; i < this.chartData.columns.length ; i++) {
      if (drawColumns[this.chartData.columns[i].label]) {
        this.processColumn(this.chartData.columns[i], i, this.tweenMaxValue[0].value, dt);
      } else {
        this.lineDraw[i] = false;
      }
    }

    this.processSelection();
    this.draw(dt);


    if (this.drawSelected) {
      this.zoom && this.zoomType !== EZoomType.area
        ? this.renderPopup(this.zoomData, this.selectedItemZoom, this.selectedItemZoomPix)
        : this.renderPopup(this.chartData, this.selectedItem, this.selectedItemPix);
    } else {
      this.popup.setPosition(-500);
    }

    this.firstRender = false;
    this.storeRenderState();
  }

  draw(dt) {
    this.ctxMain.clearRect(0,0, this.ctxMain.canvas.width, this.ctxMain.canvas.height);

    var drawPie = false;

    if (this.chartData.percentage && this.tweenZoom.inProgress) {
      if (this.tweenZoom.value < 0.5) {
        this.ctxMain.save();
        this.ctxMain.beginPath();
        this.ctxMain.arc(
          0.5 * this.ctxMain.canvas.width,
          0.5 * this.ctxMain.canvas.height,
          this.tweenCircle.step(this.tweenZoom.value) >> 0,
          0,
          2* Math.PI);
        this.ctxMain.clip();
      } else {
        drawPie = true;
      }
    }

    this.drawScales(this.ctxMain);
    this.drawSelected && this.drawSelectedLine(this.ctxMain);

    // const shouldControlsDraw = this.firstRender;
    this.plotDrawer.prepareDraw();

    for (let ci = 0, column; ci < this.chartData.columns.length ; ci++) {
      if (!this.lineDraw[ci]) continue;
      column = this.chartData.columns[ci];

      const min = this.tweenMinValue[this.chartData.yScaled ? ci : 0].value;
      const diff = this.tweenMaxValue[this.chartData.yScaled ? ci : 0].value - min;

      const zoomMin = this.tweenMinValueZoom[this.chartData.yScaled ? ci : 0].value;
      const zoomDiff = this.tweenMaxValueZoom[this.chartData.yScaled ? ci : 0].value - zoomMin;

      switch (column.type) {
        case 'line':

          console.log('asdasdasdas', this.selectedItemZoom);

          this.plotDrawer.drawColumn(
            column,
            this.lineWidth,
            this.lineOpacity[ci],
            min,
            diff,
            this.zoom ? null : this.selectedItem,
            {
              skip: !this.zoom,
              min: zoomMin,
              diff: zoomDiff,
              selectedItem: this.selectedItemZoom
          //    item: this.zoomItem,
            }
          );
        break;
        case 'bar':
          if (this.zoom && this.tweenZoom.complete) {
            continue;
          }

          this.plotDrawer.drawColumnStackedBar(
            column,
            this.lineOpacity[ci],
            this.chartData.stacked
              ? this.chartData.max / this.tweenMaxValue[0].value * this.yScale[ci]
              : this.yScale[ci],
            this.zoom ? this.zoomItem : this.selectedItem,
            {
              skip: !this.zoom,
              min: zoomMin,
              diff: zoomDiff,
              selectedItem: this.selectedItemZoom
              //    item: this.zoomItem,
            }
          );
          break;
        case 'area':

          /*if (this.tweenZoom.inProgress && !ci) {
            console.error('rotation!', this.tweenColumnsRotation[ci].step(this.tweenZoom.position * 2), this.tweenColumnsRotation[ci].targetValue)
          } */

          // drawPie = true;
          //
          if (drawPie || this.zoom && this.tweenZoom.complete) {
            const position = this.tweenZoom.value * 2 - 1;

            this.plotDrawer.drawPie(
              // 0,
              // Math.PI / 2,
              this.tweenPieStartAngle[ci].step(position),
              this.tweenPieEndAngle[ci].step(position),
              column.color,
              this.lineOpacity[ci],
              this.tweenCircle.step(this.tweenZoom.value) >> 0
            );

          } else {
            this.plotDrawer.drawColumnStackedArea(
              column,
              this.lineOpacity[ci],
              this.sums,
              this.yScale[ci],
              this.tweenZoom.inProgress
                ? -this.tweenColumnsRotation[ci].step(this.tweenZoom.value * 2)
                : 0,
              this.tweenZoom.inProgress
                ? this.tweenColumnsYOffset[ci].step(this.tweenZoom.value * 2)
                : 0,
              // - Math.PI / 2,
            );
          }

        break;
      }
    }

    if (this.chartData.percentage && this.tweenZoom.inProgress && !drawPie) {
      this.ctxMain.fillRect(0,0, this.ctxMain.canvas.width, this.ctxMain.canvas.height);
    }


    if (this.zoomType === EZoomType.bar) {

      //const max = this.getMinMaxValues(this.zoomData, {});

      for (let ci = 0, column; ci < this.zoomData.columns.length ; ci++) {
        // if (!this.lineDraw[ci]) continue;
        column =  this.zoomData.columns[ci];

        switch (column.type) {
          case 'line':
            // const min = this.tweenMinValue[0].value;
            // const diff = this.tweenMaxValue[0].value - min;

            const min = column.min;
            const diff = column.max - column.min;

            this.plotDrawer.drawColumn(
              column,
              this.lineWidth,
             this.tweenZoom.value,
              min,
              diff,
              undefined, // this.selectedItem,
              {
                item: this.zoomItem - 0.5,
                skip: true,
              },
              0,
              this.zoomData.length - 1,
              false,
              this.zoomItem - 0.5,
            );
            break;
          case 'bar':
            this.plotDrawer.drawColumnStackedBar(
              column,
              this.lineOpacity[ci],
              this.chartData.stacked
                ? this.chartData.max / this.tweenMaxValue[0].value * this.yScale[ci]
                : 1,
              this.zoom ? this.zoomItem : this.selectedItem,
            );
            break;
        }
      }
    }

    this.ctxMain.restore();


    this.renderValues(dt);

    // TODO: check is needed draw control plot!!!

    this.controlPlotDrawer.prepareDraw();


    this.ctxControl.clearRect(0,0, this.ctxControl.canvas.width, this.ctxControl.canvas.height);

    for (let ci = 0, column; ci < this.chartData.columns.length ; ci++) {
      if (!this.lineDraw[ci]) continue;
      column = this.chartData.columns[ci];

      switch (column.type) {
        case 'line':
          const min = this.chartData.yScaled ? column.min : this.chartData.min;
          const diff = (this.chartData.yScaled ? column.max : this.chartData.max) - min;

          this.controlPlotDrawer.drawColumn(
            column,
            this.controlLineWidth,
            this.lineOpacity[ci],
            min,
            diff,
            undefined,
            {
              skip: !this.zoom,
              min: this.zoomData.min,
              diff: this.zoomData.max - this.zoomData.min,
            }
          );
          break;
        case 'bar':
          this.controlPlotDrawer.drawColumnStackedBar(
            column,
            this.lineOpacity[ci],
            this.yScale[ci],
          );
          break;
      }
    }

    const rectLeftPos = (this.left - this.controlPlotDrawer.positionLeft) / this.controlPlotDrawer.diff;
    const rectRightPos = (this.right - this.controlPlotDrawer.positionLeft) / this.controlPlotDrawer.diff;


    this.renderRect(rectLeftPos, rectRightPos);
  }

  drawScales(ctx) {
    ctx.lineWidth = this.scaleWidth;
    ctx.strokeStyle = this.scaleColor;

    this.scaleDraw.forEach((draw, index) => {
      if (!draw) {
        return;
      }
      ctx.globalAlpha = this.scaleOpacity[index];
      const step = 1 / 6; //this.scaleStep[index];
      ctx.beginPath();
      for (let i = 6, y; i--;) {
        y = ctx.canvas.height - i * step;
        ctx.moveTo(this.scaleOffsetX, y);
        ctx.lineTo(ctx.canvas.width, y);
      }
      ctx.stroke();
    });
  }

  drawSelectedLine(ctx) {
    ctx.lineWidth = this.scaleWidth;
    ctx.strokeStyle = this.mouseLineColor;

    const x = this.zoom ? this.selectedItemZoomPix * this.DPI : this.selectedItemPix * this.DPI;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ctx.canvas.height);
    ctx.stroke();
  }

  renderValues(dt) {

    // if (this.ctx) {
      // this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

      this.ctxMain.fillStyle = this.textColor;
      this.ctxMain.font = this.options.font;

      this.scaleDraw = [1, 0];

      this.scaleDraw.forEach((draw, index) => {
        if (!draw) {
          return;
        }

        const max = this.zoom ? this.tweenMaxValueZoom[0].targetValue : this.tweenMaxValue[0].targetValue;
        const min = this.zoom ? this.tweenMinValueZoom[0].targetValue : this.tweenMinValue[0].targetValue;

        this.drawScaleValues(min, max - min, /*this.scaleStep[index]*/ 1/6 * this.ctxMain.canvas.height, this.scaleOpacity[index]);
      });


      this.drawDates(dt);
    // }
  }

  getItemPosition(index) {
    return index * this.step - this.xOffset + this.chartOffset
  }

  getItemPositionAbs(index) {
    return index * this.chartData.step;
  }

  renderPopup(data, item, pix) {
    const popupLeft = 30;

    const calcSum = data.stacked && !data.percentage;
    const calcPercentage = data.percentage;
    let sum = 0;

    const values = data.columns.map(column => {
      if (!column.active) return null;

      if (calcSum) {
        sum += column.values[item];
      }

      return {
        color: column.color,
        name: column.name,
        value: column.values[item],
        prefix: calcPercentage ? (' ' + ((column.values[item] / this.sums[item] * 100) + 0.5 >> 0) + '% ').slice(-4) : ''
      };
    });


    if (calcSum) {
      values.push({
        color: '#000000',
        name: 'All',
        value: sum
      });
    }


    this.popup.draw(
      this.zoom ? Plot2.ZOOM_FORMAT.format(data.timestamps[item]) : Plot2.DATE_FORMAT.format(data.timestamps[item]),
      '',
      values,
    );

    this.popup.setPosition(pix - popupLeft);

    // if (valueIndex !== this.valueIndex) {
    //   this.popupEl.style.display = 'block';
    //   this.popupEl.innerHTML = this.popupHTML(this.selectedItem);
      // this.valueIndex = valueIndex;
      // const rect = this.popupEl.getBoundingClientRect();

      // let left = pix;


      // TODO: think what to do with this:
      /*

      const maxValue = this.chartData.columns.reduce((acc, c) => {
        if (!c.active) {
          return acc;
        }
        return acc > c.values[valueIndex] ? acc : c.values[valueIndex];
      }, 0);

      */

      /*
      const dMax = 0; //maxValue / this.maxValue;

      if (rect.width + pix > this.plotDrawer.pos.width) {
        left = pix - rect.width + 20;
      } else if (left - popupLeft < 0 || dMax > 0.7) {
        left = pix + popupLeft + 10;
      }

      this.popupEl.style.transform = 'translateX(' + left + 'px)';
      */

    // }
  }

  updateHeader() {
    if (this.zoom) {
      this.options.valueEl.textContent = Plot2.ZOOM_VALUE_FORMAT.format(this.chartData.timestamps[this.zoomItem]);
    } else {
      this.options.valueEl.textContent =
        Plot2.VALUE_FORMAT.format(this.chartData.timestamps[this.plotDrawer.leftItem])
        + ' - ' +
        Plot2.VALUE_FORMAT.format(this.chartData.timestamps[this.plotDrawer.rightItem]);
    }
  }

  renderRect(left, right) {
    const width = this.controlPlotDrawer.pos.width;

    const leftPix = left * width;
    const rightPix = right * width;

    this.leftSubstrateEl.style.right = width - leftPix ;
    this.rightSubstrateEl.style.left = rightPix ;

    this.rectEl.style.cssText = 'left:' + (leftPix) + ';right:' + (width - rightPix);
  }

  zoomIn(itemIndex) {
    if (this.chartData.percentage) {
      this.zoomArea();
      return;
    }

    const date = new Date(this.chartData.timestamps[itemIndex]);

    loadFromSrc(`data/${this.chartData.path}/${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}/${('0' + date.getDate()).slice(-2)}.json`, true)
      .then(raw => {
        if (this.chartData.stacked) {
          return; // TODO: TEMP!;
        }

        const data = parseChartData(raw);

        this.zoom = true;
        this.zoomItem = itemIndex;
        this.zoomData = data;
        this.animationsCount ++;

        this.options.titleEl.classList.add('zoom');
        this.options.titleEl.textContent = 'Zoom out';
        this.updateHeader();

        if(this.chartData.stacked) {
          this.zoomBarStacked();
        } else if (this.chartData.bar) {
          this.zoomBar();
        } else {
          this.zoomLine();
        }
      });
  }

  zoomBar(out) {
    if (out) {
      this.tweenZoom.to(1, 0, this.dt, this.options.animationTime);
      return;
    }

    this.zoomType = EZoomType.bar;

    const itemIndex = this.selectedItem;
    const itemPosition = this.getItemPositionAbs(itemIndex);
    const halfStep = this.chartData.step / 2;

    this.plotDrawer.setZoomAnimationTarget(itemPosition - halfStep, itemPosition + halfStep);
    this.tweenZoom.to(0, 1, this.dt, this.options.animationTime);
    this.tweenColumns.forEach((tween, index) => tween.to(this.lineOpacity[index], 0));

    this.tweenRectLeft.to(this.left, itemPosition - halfStep);
    this.tweenRectRight.to(this.right, itemPosition + halfStep);


    // this.zoomMax = this.getMinMaxValues(this.zoomData, {});
    this.zoomData.stepCount = this.zoomData.length;
    this.zoomData.startIndex = this.selectedItem;
    this.zoomData.itemsCount = 1;
    this.plotDrawer.setZoomData(this.zoomData);
  }

  zoomLine(out) {
    if (out) {
      this.plotDrawer.refreshZoomAnimationTarget();
      this.controlPlotDrawer.refreshZoomAnimationTarget();
      this.tweenRectLeft.to(this.tweenRectLeft.startValue, this.left);
      this.tweenRectRight.to( this.tweenRectRight.startValue, this.right);
      this.tweenZoom.to(1, 0, this.dt, this.options.animationTime);

      return;
    }

    this.zoomType = EZoomType.line;

    const itemIndex = this.selectedItem;
    const itemPosition = this.getItemPositionAbs(itemIndex);

    let leftItem = itemIndex - 3;
    let rightItem = itemIndex + 3;

    if (rightItem > this.chartData.length - 1) {
      rightItem = this.chartData.length - 1;
      leftItem = rightItem - 7;
    }

    if (leftItem < 0) {
      leftItem = 0;
      rightItem = 7;
    }


    this.zoomData.startIndex = Math.max(0, itemIndex - 3);
    this.zoomData.stepCount = 24;
    this.zoomData.itemsCount = 7;


    this.plotDrawer.setZoomAnimationTarget(itemPosition, itemPosition + this.chartData.step);
    this.controlPlotDrawer.setZoomAnimationTarget(
      this.getItemPositionAbs(leftItem),
      this.getItemPositionAbs(rightItem)
    );

    this.plotDrawer.setZoomData(this.zoomData);
    this.controlPlotDrawer.setZoomData(this.zoomData);

    this.tweenRectLeft.to(this.left, itemPosition);
    this.tweenRectRight.to(this.right, itemPosition + this.chartData.step);
    this.tweenZoom.to(0, 1, this.dt, this.options.animationTime);

  }

  zoomStacked(out) {

    this.zoomType = EZoomType.stacked;

    const itemIndex = this.selectedItem;
    const itemPosition = this.getItemPositionAbs(itemIndex);

    let leftItem = itemIndex - 3;
    let rightItem = itemIndex + 3;

    if (rightItem > this.chartData.length - 1) {
      rightItem = this.chartData.length - 1;
      leftItem = rightItem - 7;
    }

    if (leftItem < 0) {
      leftItem = 0;
      rightItem = 7;
    }

    this.zoomData.startIndex = Math.max(0, itemIndex - 3);
    this.zoomData.stepCount = 24;
    this.zoomData.itemsCount = 7;

    this.plotDrawer.setZoomAnimationTarget(itemPosition, itemPosition + this.chartData.step);
    this.controlPlotDrawer.setZoomAnimationTarget(
      this.getItemPositionAbs(leftItem),
      this.getItemPositionAbs(rightItem)
    );

    this.plotDrawer.setZoomData(this.zoomData);
    this.controlPlotDrawer.setZoomData(this.zoomData);

    this.tweenRectLeft.to(this.left, itemPosition);
    this.tweenRectRight.to(this.right, itemPosition + this.chartData.step);
    this.tweenZoom.to(0, 1, this.dt, this.options.animationTime);
  }

  zoomArea(out) {
    this.zoomType = EZoomType.area;

    const itemIndex = this.selectedItem;

    this.zoom = true;
    this.zoomItem = itemIndex;

    this.animationsCount ++;

    const itemPosition = this.getItemPositionAbs(itemIndex);
    const halfStep = this.chartData.step / 2;

    this.plotDrawer.setZoomAnimationTarget(itemPosition - halfStep, itemPosition + halfStep);


    this.tweenRectLeft.to(this.left, itemPosition - halfStep);
    this.tweenRectRight.to(this.right, itemPosition + halfStep);
    this.tweenZoom.to(0, 1, this.dt, this.options.animationTime * 20);

    this.tweenCircle.to(1000, 400);

    this.tweenColumnsRotation = [];
    this.tweenColumnsYOffset= [];
    this.tweenPieStartAngle = [];
    this.tweenPieEndAngle = [];

    let stack = 0;
    let stackRotation = 0;
    let prevAngle = 0;
    let firstAngle = 0;
    let stackAngle = 0;


    const parts = [];

    this.chartData.columns.forEach(({ values }, idx, arr) => {
        const part = values[itemIndex] / this.sums[itemIndex];
        stack += part;
        parts.push(part);

        const halfAnglePart = part * Math.PI;

        const endAngle = (stackRotation + halfAnglePart) / 2;

        !idx && (firstAngle = endAngle);


      this.tweenColumnsRotation.push(Tween.to(0, endAngle));
      this.tweenColumnsYOffset.push(Tween.to(0, 0.5 - stack));

      this.tweenPieStartAngle.push(Tween.to(
        prevAngle ? prevAngle + Math.PI: firstAngle,
        //stackRotation + Math.PI / 2,
        stackAngle + Math.PI / 2,
      ));

      stackAngle += part * Math.PI * 2;

      this.tweenPieEndAngle.push(Tween.to(
        idx === arr.length - 1 ? 2 * Math.PI + firstAngle: endAngle + Math.PI,
       // stackRotation + halfAnglePart * 2
        stackAngle + Math.PI / 2
      ));


      stackRotation += halfAnglePart * 2;
      prevAngle = endAngle;
    });
  }

  handlePopupClick = () => {
    if (this.zoom) return;
    this.zoomIn(this.selectedItem);
  };

  handleZoomOut = () => {
    if (!this.zoom) return;
    console.error('zoom out!');

    this.options.titleEl.classList.remove('zoom');
    this.options.titleEl.textContent = this.chartData.name;

    switch (this.zoomType) {
      case EZoomType.line: this.zoomLine(true);
      case EZoomType.bar: this.zoomBar(true);
    }
  }
}

class PlotDrawer {
  constructor(ctx, paddingX = 0, DPI = 1) {
    this.ctx = ctx;
    this.paddingX = paddingX;
    this.DPI = DPI;


    this.tweenPositionLeft = new Tween();
    this.tweenPositionRight = new Tween();
    this.tweenCenter = new Tween();
    this.tweenDiff = new Tween();
    this.tweenScale = new Tween();

    this.ZOOM_FACTOR = 1;


    this.resize();
  }

  resize() {
    this.pos = this.ctx.canvas.getBoundingClientRect();

    this.ctx.canvas.width = this.pos.width * this.DPI;
    this.ctx.canvas.height = this.pos.height * this.DPI;

    this.chartWidth = this.pos.width - this.paddingX * 2;
    this.chartOffset = this.paddingX / this.chartWidth;

    this.chartWidthCanvas = this.chartWidth * this.DPI;
  }

  setChartData(chartData) {
    this.chartData = chartData;
    this.leftItem = 0;
    this.rightItem = chartData.length - 1;
  }

  setZoomData(zoomData) {
    this.zoomData = zoomData;
    this.zoomAnimationPosition = 0;



  }

  setZoomAnimationTarget(left, right) {
    const nextDiff = right - left;
    this.tweenCenter.to(this.positionLeft + this.diff /2, left + nextDiff /2);
    this.tweenDiff.to(this.diff, nextDiff);
    this.zoomAnimationPosition = 0;

    this.zoomLeft = left;
    this.zoomRight = right;

    this.tweenScale.to(this.scale, 1 / nextDiff);
    this.tweenPositionLeft.to(this.positionLeft, left);
    this.tweenPositionRight.to(this.positionRight, right);
  }

  refreshZoomAnimationTarget() {
    this.tweenCenter.to(this.tweenCenter.startValue, this.positionLeft + this.diff * 0.5);
    this.tweenDiff.to(this.tweenDiff.startValue, this.diff);
  }

  processZoomAnimation(d) {
    this.zoomAnimationPosition = d;

    // if (d >= 1) {
    //   this.setPosition(this.tweenPositionLeft.targetValue, this.tweenPositionRight.targetValue);
    //   this.zoomAnimationPosition = 1;
    //   this.zoomAnimationPositionEase = 1;
    //   return;
    // }

    function ease(t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t }
    // function ease(t) { return t*t*t*t }
    // function ease(t) { return t }
    function ease(t) { return Math.sqrt(Math.sin(Math.PI / 2 * t)) }

    this.zoomAnimationPositionEase = ease(d);

    const nextCenter = this.tweenCenter.step(this.zoomAnimationPositionEase);
    /* const nextCenter = this.startCenter + Math.min(1, d * 1000) * this.dCenter;

*/


    // const tt = this.totalItemsInFrame >> 0;

    this.diff = this.tweenDiff.step(this.zoomAnimationPositionEase);

    this.scale = 1 / this.diff;
    this.step = this.scale * this.chartData.step;
    this.totalItemsInFrame = 1 / this.step;

    this.setCenter(nextCenter);
    this.calcItemsInPosition();


    // if (tt  !== this.totalItemsInFrame >> 0) {
    //   console.log(this.totalItemsInFrame);
    // }



    // this.ZOOM_FACTOR = 1 + d * (this.chartData.length - 1) ;

    // console.log(this.ZOOM_FACTOR);
    // console.log(this.step * this.ZOOM_FACTOR);

    const nextLeft =  this.tweenPositionLeft.step(d);
    const nextRight = this.tweenPositionRight.step(d);

    const zoomD = (1 / this.tweenScale.startValue) * d;

    // this.ZOOM_FACTOR = 1 + (1 / this.step) * d;

    // this.setPosition(
    //   this.tweenPositionLeft.step(d),
    //   this.tweenPositionRight.step(d)
    // );

    /*
    // this.calcItemsInPosition();
    //this.chartOffset && console.log(this.scale);
    */

    // remove setScale?
   // this.setScale(this.tweenScale.step(zoomD));
    // console.log(this.scale);


   /*
    this.setScale(this.startScale + d * this.dScale);
    if (this.chartOffset !== 0 ) console.log(this.scale);
    */

    this.zoomAnimationPosition = d;
  }

  getItemOnPosition(x) {
    const stX = x / this.chartWidth - this.chartOffset;
    return Math.round(this.totalItemsInFrame * this.xOffset + stX / this.step);
  }

  getItemOnPositionZoom(x) {
    const stX = x / this.chartWidth - this.chartOffset;
    const item = this.totalItemsInFrame * this.xOffset + stX / this.step;
    const offset = (item >> 0) - this.zoomData.startIndex;
    const part = item % 1;

    return offset * this.zoomData.stepCount + Math.round(part / (1/this.zoomData.stepCount));
  }

  // Set zoom positions of the chart, must be 0..1;
  setPosition(left, right) {
    const diff = right - left;
    this.xOffset = left / diff;
    // this.ctxMain.uniform1f(this.uniforms.xOffset, this.xOffset);

    if (diff !== this.diff) {
      this.diff = diff;
      this.scale = 1 / diff;
      this.step = this.scale * this.chartData.step;
      this.totalItemsInFrame = 1 / this.step;
    }

    if (left !== this.positionLeft || right !== this.positionRight) {
      this.positionLeft = left;
      this.positionRight = right;
      this.calcItemsInPosition();
    }
  }


  setCenter(center) {
    this.positionLeft = center - this.diff / 2;
    this.positionRight = center + this.diff / 2;
    this.xOffset = this.positionLeft / this.diff;
  }

  setScale(scale) {
    this.scale = scale;
    const nextDiff = 1 / scale;

    const dDiff = (nextDiff - this.diff) / 2;

    this.positionLeft -= dDiff;
    this.positionRight += dDiff;

    this.xOffset = this.positionLeft / nextDiff;

    this.diff = nextDiff;
    this.step = this.scale * this.chartData.step;
    this.totalItemsInFrame = 1 / this.step;

    this.calcItemsInPosition();
  }

  calcItemsInPosition() {
    this.leftItemAbs = this.getLeftItem();
    this.rightItemAbs = this.getRightItem();

    const potencialLeftItem = Math.ceil(this.leftItemAbs);
    const potencialRightItem = this.rightItemAbs >> 0;

    this.leftItem = potencialLeftItem < 0
      ? 0
      : potencialLeftItem;
    this.rightItem = potencialRightItem > this.chartData.length - 1
      ? this.chartData.length - 1
      : potencialRightItem;

    this.startPoint = Math.max(this.leftItem - 1, 0);
    this.endPoint = Math.min(this.rightItem + 1, this.chartData.length - 1);
  }



  getLeftItem() {
    return this.totalItemsInFrame * this.xOffset - this.chartOffset / this.step;
  }

  getRightItem() {
    return this.getLeftItem() +  this.totalItemsInFrame + 2 * this.chartOffset / this.step;
  }


  getItemPosition(index, step) {
    return (index * step - this.xOffset + this.chartOffset);
  }

  getItemPositionPix(index) {
    return this.getItemPosition(index, this.step) * this.chartWidth;
  }

  getItemPositionPixZoom(index) {
    const item = index / this.zoomData.stepCount >> 0;
    const dec = index / this.zoomData.stepCount % 1;
    return this.getItemPositionPix(this.zoomData.startIndex + item) +
      dec * this.step * this.chartWidth
  }

  prepareDraw() {
    // if (this.chartData.stacked) {
      this.yStack = new Array(this.chartData.length).fill(0);
    // }
  }

  rotate(x, y, anchorX, anchorY, angle) {
    const dx = x - anchorX;
    const dy = y - anchorY;

    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    return {
      x: anchorX + dx * cos - dy * sin,
      y: anchorY + dx * sin + dy * cos,
    }

  }

  drawColumn(
    column,
    lineWidth,
    opacity = 1,
    min,
    diff,
    selectedItem,
    zoomConfig,
    startPoint = this.startPoint,
    endPoint = this.endPoint,
  ) {

    const ctx = this.ctx;

    let x, y;
    let arcX, arcY;
    let prevX, prevY;
    const normalData = column.normalData;
    const values = column.values;
    const width = this.chartWidthCanvas * this.ZOOM_FACTOR;

    const height = ctx.canvas.height;

    const step = this.step;

    const totalItems = endPoint - startPoint + 1;


    const drawZoomData = zoomConfig && !zoomConfig.skip;
    const zoomItemPosition = zoomConfig && zoomConfig.item ? this.getItemPosition(zoomConfig.item, step) : false;

    ctx.globalAlpha = opacity;
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.lineTo(50, 50);
    ctx.lineTo(100, 75);
    ctx.stroke();

  /*  console.log('wtf');
    if (this.zoomData) {
      console.log({
        startPoint: this.startPoint,
        endPoint: this.endPoint,
        zStartIndex: this.zoomData.startIndex,
        zItemsCount: this.zoomData.itemsCount,
        zStepCount: this.zoomData.stepCount,
      });

    }*/

    for (let i = startPoint; i <= endPoint; i++) {

      x = zoomItemPosition
        ? zoomItemPosition + i / totalItems * step
        : this.getItemPosition(i, step);


      y = 1 - (values[i] - min) / diff;//normalData[i] * yScale;

      if (i === startPoint) {
        ctx.moveTo(0, y);// x,y
      }


      if (drawZoomData) {
        const k = i - this.zoomData.startIndex;
        if (k >= 0 && k < this.zoomData.itemsCount) {
          let zx, zy;
          let lx, ly; // main line position;

          const dx = (x - prevX) / this.zoomData.stepCount;
          const dy = (y - prevY) / this.zoomData.stepCount;

          const zoomStep = this.step / this.zoomData.stepCount;

          const zoomStart = k * this.zoomData.stepCount;
          const zoomEnd = zoomStart + this.zoomData.stepCount;

          const zoomValues = this.zoomData.columns[column.index].values;

          console.log('selectedItem', zoomConfig.selectedItem, zoomStart, zoomEnd);
          for(let j = zoomStart, c = 0; j < zoomEnd; j++, c++) {

            ly = prevY + dy * c;

            zx = x + zoomStep * c;
            // zy = this.zoomData.columns[column.index].normalData[j];// * this.zoomAnimationPosition;
            zy = 1 - (zoomValues[j] - zoomConfig.min) / zoomConfig.diff;

            if (j === zoomConfig.selectedItem) {
              arcX = x;
              arcY = y;
            }

            // if (c < 3) {
            //   console.log({zx, zy});
            // }


            if (this.zoomAnimationPosition < 1) zy = ly + (zy - ly) * Math.pow(this.zoomAnimationPosition, 1);

            ctx.lineTo(zx * width >> 0, zy * height >> 0);
          }

          prevX = x;
          prevY = y;

          continue;
        }
      }

      prevX = x;
      prevY = y;

      x = x * width >> 0;
      y = y * height >> 0;

      ctx.lineTo(x, y);

      if (i === selectedItem) {
        arcX = x;
        arcY = y;
      }

    }

    ctx.lineTo(this.ctx.canvas.width, y);

    ctx.stroke();

    if (selectedItem !== null) {
      ctx.beginPath();
      ctx.arc(arcX, arcY, 4 * this.DPI, 0, 2* Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawColumnStackedArea(column, opacity, sums, yScale, rotation, yOffset = 0) {
    const ctx = this.ctx;

    let x, y;
    let drawX, drawY;
    let rotatedPoint;

    const values = column.values;
    const width = this.chartWidthCanvas;
    const height = ctx.canvas.height;

    ctx.globalCompositeOperation = 'destination-over'; // I LOVE YOU CANVAS!

    ctx.globalAlpha = opacity;
    ctx.fillStyle = column.color;
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    x = 0;
    y = 1;

    if (rotation) {
      rotatedPoint = this.rotate(x, y, 0.5, 0.5, -rotation);
      x = rotatedPoint.x;
      y = rotatedPoint.y;
    }

    ctx.moveTo(x * width >> 0, y * height * 2 >> 0);

    for (let i = this.startPoint; i <= this.endPoint; i++) {
      x = this.getItemPosition(i, this.step);
      // y = 1 - normalData[i] * this.yScale[index];
      // y = 1 - (values[i] * yScale) / sums[i];
      this.yStack[i] += (values[i] * yScale) / sums[i];

      y = this.yStack[i] + yOffset;

      drawY = y;
      drawX = x;

      if (rotation) {
        rotatedPoint = this.rotate(x,y, 0.5,0.5, rotation);
        drawX = rotatedPoint.x;
        drawY = rotatedPoint.y;
      }

      ctx.lineTo(drawX * width >> 0, (1 - drawY) * height >> 0);
    }

    // x = 1;
    y = 1;

    if (rotation) {
      rotatedPoint = this.rotate(x, y, 0.5, 0.5, -rotation);
      x = rotatedPoint.x;
      y = rotatedPoint.y;
    }


    ctx.lineTo(x * width >> 0, y * height * 2 >> 0);
    // ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }

  drawPie(startAngle, endAngle, color, opacity, radius) {
    const ctx = this.ctx;

    ctx.globalCompositeOperation = 'source-over';

    ctx.lineWidth = 1;

    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;


    // const part =  (value * yScale) / sum;
    // const angle = part * Math.PI * 2;
    // const stackAngle = this.yStack[0];

    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();

    ctx.moveTo(centerX,centerY);
    ctx.arc(centerX, centerY, radius,  startAngle, endAngle);
    // ctx.lineTo(centerX, centerY);
    ctx.closePath();
    ctx.fill();
    //ctx.stroke();

    // this.yStack[0] += angle;
  }

  // TODO: refactor and optimize AND TEST
  drawColumnStackedBar(column, opacity, yScale, selectedItem = null, zoomConfig) {
    const ctx = this.ctx;

    let x, y, prevX;
    const normalData = column.normalData;
    const width = this.chartWidthCanvas * this.ZOOM_FACTOR;

    const offsetAbs = (this.ZOOM_FACTOR - 1) * this.chartWidthCanvas * 0.5 >> 0;

    const height = ctx.canvas.height;

    const step = this.step;


    const hStep = step / 2;
    const stepWidth = step * width;

    const drawZoomData = zoomConfig && !zoomConfig.skip;
    const zoomItemPosition = zoomConfig && zoomConfig.item ? this.getItemPosition(zoomConfig.item, step) : false;



    let correct = false;

    const alpha = selectedItem !== null ? Math.min(0.8, opacity) : opacity;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = column.color;
    ctx.strokeStyle = '#fff';

    ctx.beginPath();

    x = (this.getItemPosition(this.startPoint, step) - hStep) * width;
    y = normalData[this.startPoint] * yScale;
    this.yStack[this.startPoint] += y;

    const barWidth = Math.round((this.getItemPosition(this.startPoint, step) + hStep) * width - x);
    x = Math.round(x);

    // ctx.fillRect(
    ctx.fillRect(
      x - offsetAbs,
      (1 - this.yStack[this.startPoint]) * height,
      barWidth,
      y * height
    );

    x = x + barWidth;


    for (let i = this.startPoint + 1; i <= this.endPoint; i++) {

      if (i === selectedItem) {
        ctx.globalAlpha = Math.min(1, opacity);
      } else {
        ctx.globalAlpha = alpha;
      }


      const barWidth = Math.round((this.getItemPosition(i, step) + hStep) * width - x);
      y = normalData[i] * yScale;

      correct = x % 1 > 0.5;
      const drawX = correct ? x - 1 : x;


      this.yStack[i] += y;

      ctx.fillRect(
        x - offsetAbs,
        (1 - this.yStack[i]) * height,
        barWidth,
         y * height
      );


      x = x + barWidth;
    }

    ctx.stroke();
  }

}
