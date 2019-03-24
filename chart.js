let LOG = false;
let t0 = 0;
let t1 = 0;

class Chart {
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

    this.plot = new Plot(chartCanvas, chartValuesCanvas, {
      DPI,
      lineThickness: 2,
      lineSmooth: DPI === 1 ? 0.3 : 0.85 * DPI,
      popupEl,
      font: `${14 * DPI}px Arial`
    });
    this.controlPlot = new ControlPlot(chartControlsCanvas, null, { lineSmooth: 0.425 * DPI });
    this.setTheme(colorTheme);
    this.init();
    this.renderBind = this.render.bind(this);
    requestAnimationFrame(this.renderBind);
  }

  init() {
    this.plot.setChartData(this.data);
    this.controlPlot.setChartData(this.data);

    this.plot.setPosition(0.75, 1);
    this.controlPlot.setSelection(0.75, 1);

    this.columnSelector.addEventListener('change', this.handleColumnSelectorChange)
  }

  setTheme(theme) {
    this.plot.setTheme(theme);
    this.controlPlot.setTheme(theme);
  }

  resize() {
    this.plot.resize();
    this.controlPlot.resize();
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
      <div>
        <div class="chart-holder">
          <canvas data-selector="chart"></canvas>
          <canvas class="chart-values" data-selector="chartValues"></canvas> 
          <div class="popup"></div>
        </div>
        <div class="chart-controls-holder">
            <canvas data-selector="chartControls"></canvas>
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
    this.plot.setPosition(this.controlPlot.left, this.controlPlot.right);
    this.plot.render(dt);
    t1 = performance.now();
    LOG && console.log(this.data.id + ' main chart render:', t1 - t0);
    t0 = performance.now();
    this.controlPlot.render(dt);
    t1 = performance.now();
    LOG && console.log(this.data.id + 'control chart render', t1 - t0);
    LOG && console.error(this.data.id + 'TOTAL', t1 - s);

    requestAnimationFrame(this.renderBind);
  }

}

// Class to render chart values
class Plot {
  static DATA_TEXTURE_SIZE = 32;
  static DATA_TEXTURE_LEVEL = 0;
  static VERTEX_SHADER_SRC = '';
  static FRAGMENT_SHADER_SRC = '';
  static TIME_FORMAT = new Intl.DateTimeFormat('en-us', {day: 'numeric', month: 'short'});
  static DATE_FORMAT = new Intl.DateTimeFormat('en-us', {weekday: 'short', day: 'numeric', month: 'short'});
  static DATE_WIDTH = 20;

  static DEFAULT_OPTIONS = {
    DPI: window.devicePixelRatio,
    animationTime: 400, // 600

    popupEl: null,

    lineThickness: 1,
    lineSmooth: 1,

    scaleThickness: 1,
    scaleCount: 6,
    scaleOffsetX: 20,

    selectedCircleRadius: 5,

    font: '',
    padding: 20,
  };

  constructor(canvasEl, canvasValuesEl, options) {
    this.canvasPos = canvasEl.getBoundingClientRect();
    // canvasEl.style.width = this.canvasPos.width;

    this.options = Object.assign({}, Plot.DEFAULT_OPTIONS, options);

    // For resize:
    this.chartWidth = this.canvasPos.width - this.options.padding * 2;
    this.chartOffset = this.options.padding / this.chartWidth;

    this.DPI = this.options.DPI;
    this.popupEl = this.options.popupEl;

    canvasEl.width = this.canvasPos.width * this.DPI;
    canvasEl.height = this.canvasPos.height * this.DPI;

    const gl = canvasEl.getContext('webgl', {
      alpha: false,
    });

    if (!gl) {
      alert('WebGl is not supported by your browser');
      return;
    }

    const vertexShader = webGLUtils.createShader(gl, gl.VERTEX_SHADER, Plot.VERTEX_SHADER_SRC);
    const fragmentShader = webGLUtils.createShader(gl, gl.FRAGMENT_SHADER, Plot.FRAGMENT_SHADER_SRC);
    const program = webGLUtils.createProgram(gl, vertexShader, fragmentShader);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);
    this.program = program;

    this.buffer = gl.createBuffer();
    // init data texutre: x;
    this.dataTexture = gl.createTexture();
    this.dataTextureUnit = 0;
    gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
    gl.activeTexture(gl.TEXTURE0 + this.dataTextureUnit);

    const uintData = new Uint8Array(Plot.DATA_TEXTURE_SIZE * Plot.DATA_TEXTURE_SIZE * 3);
    gl.texImage2D(
      gl.TEXTURE_2D,
      Plot.DATA_TEXTURE_LEVEL,
      gl.RGB, // RGBA
      Plot.DATA_TEXTURE_SIZE,
      Plot.DATA_TEXTURE_SIZE,
      0,
      gl.RGB, // RGBA
      gl.UNSIGNED_BYTE,
      uintData
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    // init texture end;

    this.attributes = {
      position: gl.getAttribLocation(program, 'a_position'),
    };

    this.uniforms = {
      mouse: gl.getUniformLocation(program, 'u_mouse'),
      dataTexture: gl.getUniformLocation(program, 'u_texture'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),

      lineColor: gl.getUniformLocation(program, 'u_line_color'),
      lineThickness: gl.getUniformLocation(program, 'u_line_thickness'),
      lineSmooth: gl.getUniformLocation(program, 'u_line_smooth'),
      lineOpacity: gl.getUniformLocation(program, 'u_line_opacity'),

      yScale: gl.getUniformLocation(program, 'u_y_scale'),
      xStep: gl.getUniformLocation(program, 'u_x_step'),
      xOffset: gl.getUniformLocation(program, 'u_x_offset'),
      xPadding: gl.getUniformLocation(program, 'u_x_padding'),

      totalItems: gl.getUniformLocation(program, 'u_total_items'),

      scaleDraw: gl.getUniformLocation(program, 'u_scale_draw'),
      scaleOpacity: gl.getUniformLocation(program, 'u_scale_opacity'),
      scaleColor: gl.getUniformLocation(program, 'u_scale_color'),
      scaleThickness: gl.getUniformLocation(program, 'u_scale_thickness'),
      scaleCount: gl.getUniformLocation(program, 'u_scale_count'),
      scaleOffsetX: gl.getUniformLocation(program, 'u_scale_offset_x'),
      scaleStep: gl.getUniformLocation(program, 'u_scale_step'),

      bgColor: gl.getUniformLocation(program, 'u_bg_color'),
      mouseLineColor: gl.getUniformLocation(program, 'u_mouseline_color'),

      selectedCircleRadius: gl.getUniformLocation(program, 'u_selected_circle_radius'),
    };

    this.gl = gl;

    this.positionLeft = 0;
    this.positionRight = 1;

    this.animationsCount = 0;

    this.animation = false;
    this.isPositiveAnimation = false;
    this.targetMaxValue = 0;
    this.startAnimation = 0;
    this.animationPosition = 0;
    this.dMaxvalue = 0;

    this.maxValue = 0;

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

    this.init(this.options);

    if (canvasValuesEl) {
      this.initValues(canvasValuesEl, options.font);
    }
  }

  init(options) {
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.gl.uniform1f(this.uniforms.xPadding, options.padding * this.DPI);
    this.gl.uniform1f(this.uniforms.lineThickness, options.lineThickness * this.DPI);
    this.gl.uniform1f(this.uniforms.lineSmooth, options.lineSmooth);
    this.gl.uniform1f(this.uniforms.lineOpacity, 1);

    this.gl.uniform2fv(this.uniforms.scaleThickness, [1 * this.DPI, 1 * this.DPI]);
    this.gl.uniform2fv(this.uniforms.scaleCount, [options.scaleCount, options.scaleCount]);
    this.gl.uniform2fv(this.uniforms.scaleOffsetX, [options.scaleOffsetX * this.DPI, options.scaleOffsetX * this.DPI]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      // rectangles
      -1, -1,
       1, -1,
      -1,  1,

      -1,  1,
       1, -1,
       1,  1
    ]), this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(this.attributes.position);
    this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, 0, 0);

    this.gl.uniform1f(this.uniforms.yScale, 1);
    this.gl.uniform1f(this.uniforms.xOffset, 0);

    this.gl.uniform1f(this.uniforms.selectedCircleRadius, options.selectedCircleRadius * this.DPI);

    this.scaleMax = [0, 0];
    this.scaleDraw = [0, 0];
    this.scaleStep = [1, 1];
    this.scaleOpacity = [1, 1];

    this.processScales();

    this.mousePos = [-1, -1];
  }

  initValues(canvas, font) {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * this.DPI;
    canvas.height = r.height * this.DPI;
    this.ctx = canvas.getContext('2d');
    this.ctx.font = font;

    this.dateBasis = 0;
    this.leftItem = 0;
    this.rightItem = 0;
    this.startItem = 0;

    this.initInteractive(canvas);
  }

  handleMouseMove = (event) => {
    this.mousePos = [event.pageX - this.canvasPos.left, event.pageY - this.canvasPos.top];
  };

  handleMouseOut = () => {
    this.mousePos = [-100, -100];
  };

  initInteractive(canvas) {
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mouseout', this.handleMouseOut);
  }

  setTheme({ bgColor, scaleColor, textColor, mouseLineColor }) {
    this.gl.uniform3fv(this.uniforms.bgColor, bgColor);
    this.gl.uniform3fv(this.uniforms.scaleColor, scaleColor.concat(scaleColor));
    this.gl.uniform3fv(this.uniforms.mouseLineColor, mouseLineColor );

    this.bgColor = [bgColor[0] / 255, bgColor[1] / 255, bgColor[2] / 255];

    this.textColor = textColor;
    this.ctx && (this.ctx.fillStyle = textColor);

    this.animationsCount++; // for force render;
  }

  setChartData(chartData) {
    this.chartData = chartData;
    this.activeColumns = chartData.columns.reduce((acc, {label, active}) => {
      acc[label] = active;
      return acc;
    }, {});
    this.gl.uniform1f(this.uniforms.xStep, chartData.step);
    this.gl.uniform1f(this.uniforms.totalItems, chartData.length);

    this.firstRender = true;
  }

  // Set zoom positions of the chart, must be 0..1;
  setPosition(left, right) {
    const diff = right - left;
    this.xOffset = left / diff;
    this.gl.uniform1f(this.uniforms.xOffset, this.xOffset);

    if (diff !== this.diff) {
      this.diff = diff;
      this.scale = 1 / diff;
      this.step = this.scale * this.chartData.step;
      this.totalItemsInFrame = 1 / this.step;


      this.gl.uniform1f(this.uniforms.xStep, this.step);

      let dateBasis =  this.totalItemsInFrame / (this.canvasPos.width / (Plot.DATE_WIDTH * 8)) >> 0;

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


          if (this.leftItem && left === this.positionLeft) {
            this.startItem = this.leftItem % this.dateBasis;
          } else if (this.rightItem && right === this.positionRight) {
            this.startItem = this.rightItem % this.dateBasis;
          } else {
            this.startItem = 0;
          }
        }
      }
    }

    this.positionLeft = left;
    this.positionRight = right;
  }

  resize() {
    this.canvasPos = this.gl.canvas.getBoundingClientRect();
    this.gl.canvas.width = this.canvasPos.width * this.DPI;
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.chartWidth = this.canvasPos.width - this.options.padding * 2;
    this.chartOffset = this.options.padding / this.chartWidth;
    this.animationsCount ++ ;

    if (this.ctx) {
      this.ctx.canvas.width = this.canvasPos.width * this.DPI;
      this.ctx.font = this.options.font;
      this.ctx.fillStyle = this.textColor;
      this.dateBasis = this.totalItemsInFrame / (this.canvasPos.width / (Plot.DATE_WIDTH * 8)) >> 0;
      if (this.dateBasis % 2) {
        this.dateBasis--;
      }
    }
  }

  getLeftItem() {
    return this.totalItemsInFrame * this.xOffset - this.chartOffset / this.step;
  }

  getRightItem() {
    return this.getLeftItem() +  this.totalItemsInFrame + 2 * this.chartOffset / this.step;
  }

  getMaxValue(val) {
    let k;
    let res;
    if (val < 1000) {
      k = val / this.options.scaleCount + 0.3 >> 0;
      k += 3;
      if (val < 100) k -= 2;
      res = k * this.options.scaleCount;
    } else {
      const l = val.toString().length;
      k = this.options.scaleCount * Math.pow(10, l - 2);
      const t = val / k + 0.3 >> 0;
      res = (t + 1) * k;
    }
    return res;
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
    const gl = this.gl;

    gl.uniform3fv(this.uniforms.lineColor, column.colorRGB);
    gl.texImage2D(
      gl.TEXTURE_2D,
      Plot.DATA_TEXTURE_LEVEL,
      gl.RGB,
      Plot.DATA_TEXTURE_SIZE,
      Plot.DATA_TEXTURE_SIZE,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      column.normalBuffer
    );
    gl.uniform1i(this.uniforms.dataTexture, this.dataTextureUnit);
    gl.uniform1f(this.uniforms.yScale, column.max / maxValue);

    index > 0 && gl.uniform2fv(this.uniforms.scaleDraw, [0, 0]);

    gl.uniform1f(this.uniforms.lineOpacity, 1);

    const animation = this.animatedColumns[column.label];
    if (animation) {
      const animationPosition = (dt - animation.start) / 200;

      if (animationPosition >= 1) {
        delete this.animatedColumns[column.label];
        gl.uniform1f(this.uniforms.lineOpacity, column.active ? 1 : 0);
      } else {
        this.animationsCount ++ ;
        gl.uniform1f(this.uniforms.lineOpacity, column.active ? animationPosition : 1 - animationPosition);
      }
    }
  }

  getMaxValueInPosition(column) {
    let i = Math.max(0, Math.ceil(this.getLeftItem()));
    const right = Math.min(column.values.length - 1, this.getRightItem() >> 0);
    let max = 0;
    for (i; i <= right; i++) {
      max = Math.max(column.values[i], max);
    }

    return this.getMaxValue(max);
  }

  processScales() {
    const gl = this.gl;

    gl.uniform2fv(this.uniforms.scaleDraw, this.scaleDraw);
    gl.uniform2fv(this.uniforms.scaleStep, this.scaleStep);
    gl.uniform2fv(this.uniforms.scaleOpacity, this.scaleOpacity);
  }

  popupHTML(index) {
    return `
      <div class='date'>${Plot.DATE_FORMAT.format(this.chartData.timestamps[index])}</div>
      <div class='values'>
        ${this.chartData.columns.map(column => {
      if (!column.active) {
        return '';
      }
      return `
            <div style='color:${column.color};'>
              <div class='value'>${this.formatValue(column.values[index])}</div>
              <div class='name'>${column.name}</div>
            </div>
          `;
    }).join('')}
      </div>
      `;
  }

  drawScaleValues() {
    this.scaleDraw.forEach((draw, index) => {
      if (!draw) {
        return;
      }

      const maxValue = this.scaleMax[index];
      const height = this.scaleStep[index] * 6;
      const opacity = this.scaleOpacity[index];
      const step = maxValue / 6;
      const textOffset = height / 6;
      this.ctx.globalAlpha = opacity;

      for (let i = 6; i--;) {
        this.ctx.fillText(this.formatValue(i * step), 20 * this.DPI, this.gl.canvas.height - i * textOffset - 5);
      }
    });
  }

  // TODO: refactor ??
  drawDates(dt) {
    this.ctx.globalAlpha = 1;

    let firstItem = true;
    let d;

    const drawDateItems = {};

    let i = Math.round(Math.max( this.startItem, this.getLeftItem() - this.totalItemsInFrame / 2));
    i -= i % this.dateBasis;
    if (this.startItem) {
      i -= i % this.startItem;
    }
    let x;

    for (i; i < this.chartData.length; i += this.dateBasis) {
      x = this.getItemPosition(i) * this.chartWidth;

      if (x < -this.canvasPos.width / 2) { continue; }
      if (x > this.canvasPos.width) { break; }
      if (firstItem) {
        this.leftItem = i;
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

      this.ctx.globalAlpha = d;
      x -= Plot.DATE_WIDTH;

      this.rightItem = i;

      this.ctx.fillText(
        Plot.TIME_FORMAT.format(this.chartData.timestamps[i]),
        x * this.DPI,
        this.ctx.canvas.height - 10
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

      const x = this.getItemPosition(i) * this.chartWidth - Plot.DATE_WIDTH;
      this.ctx.globalAlpha = 1 - d;

      this.ctx.fillText(
        Plot.TIME_FORMAT.format(this.chartData.timestamps[i]),
        x * this.DPI,
        this.ctx.canvas.height - 10
      );
    });

    Object.keys(this.drawDateItems).forEach(i => {
      if (this.drawDateItemsAnimations[i]) {
        return;
      }

      this.drawDateItemsAnimations[i] = dt /*+ 200 */;

      const x = this.getItemPosition(i) * this.chartWidth - Plot.DATE_WIDTH;
      this.ctx.fillText(
        Plot.TIME_FORMAT.format(this.chartData.timestamps[i]),
        x * this.DPI,
        this.ctx.canvas.height - 10
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

  storeRenderState() {
    this.renderState = {
      positionLeft: this.positionLeft,
      positionRight: this.positionRight,
      mouseX: this.mousePos[0],
    }
  }

  shouldRender() {
    return (
      !this.maxValue ||  // is first draw
      this.animationsCount || // is any animation
      this.positionLeft !== this.renderState.positionLeft ||
      this.positionRight !== this.renderState.positionRight ||
      this.mousePos[0] !== this.renderState.mouseX
    );
  }

  render(dt) {
    this.prepareColumns(dt);

    if (!this.shouldRender()) {
     return;
    }

    this.animationsCount = 0;
    const drawColumns = [];
    let maxValue = 0;
    let i;
    let column;
    let columnMax;

    // Find current maximun
    for (i = 0; i < this.chartData.columns.length; i++) {
      column = this.chartData.columns[i];

      if (this.animatedColumns[column.label] || column.active) {
        drawColumns.push(column);
      }

      if (!column.active) {
        continue;
      }

      columnMax = this.getMaxValueInPosition(column);
      maxValue = columnMax > maxValue ? columnMax : maxValue;
    }

    if (!drawColumns.length) {
      this.maxValue = 0;
      return;
    }

    if (this.currMaxValue !== maxValue && maxValue !== this.targetMaxValue) {

      if (!this.maxValue) {
        this.maxValue = maxValue;
      } else {
        this.animation = true;

        this.targetMaxValue = maxValue;
        this.startAnimation = dt;
        this.startMaxValue = this.currMaxValue;
        this.dMaxvalue = this.targetMaxValue - this.currMaxValue;
        this.isPositiveAnimation = this.targetMaxValue > this.startMaxValue;
        this.scaleMax = [this.maxValue, this.targetMaxValue];
      }
    }

    const gl = this.gl;
    const baseScaleStep = gl.canvas.height / this.options.scaleCount;

    // process animation (scales)
    if (this.animation) {

      this.animationPosition = (dt - this.startAnimation) / this.options.animationTime;
      this.currMaxValue = this.startMaxValue + this.animationPosition * this.dMaxvalue;

      const stopAnimation = this.isPositiveAnimation
        ? this.currMaxValue > this.targetMaxValue
        : this.currMaxValue < this.targetMaxValue;

      if (stopAnimation) {
        this.animation = false;
        this.maxValue = this.targetMaxValue;
      } else {
        this.animationsCount ++ ;
        this.scaleDraw = [1, 1];
        this.scaleStep = [
          this.isPositiveAnimation ? baseScaleStep * (1 - this.animationPosition) : baseScaleStep * (1 + this.animationPosition),
          this.isPositiveAnimation ? baseScaleStep * (1 + (1 - this.animationPosition)) : baseScaleStep * this.animationPosition,
        ];
        this.scaleOpacity = [
          1 - this.animationPosition,
          this.animationPosition
        ];
      }
    }

    // Prepare data for scales
    if (!this.animation) {
      this.currMaxValue = this.maxValue;
      this.scaleMax = [this.maxValue, 0];
      this.scaleOpacity = [1, 1];
      this.scaleDraw = [1, 0];
      this.scaleStep = [baseScaleStep, baseScaleStep];
    }

    // prepare variables
    gl.uniform2fv(this.uniforms.mouse, this.mousePos.map(v => v * this.DPI));
    gl.uniform2fv(this.uniforms.resolution, [gl.canvas.width, gl.canvas.height]);

    // clear canvas
    gl.clearColor(this.bgColor[0], this.bgColor[1], this.bgColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // prepare scales
    this.processScales();

    // process columns and draw each
    for (i = 0; i < drawColumns.length; i++) {
      this.processColumn(drawColumns[i], i, this.currMaxValue, dt);
      this.draw();
    }

    this.renderValues(dt);
    this.renderPopup();
    this.storeRenderState();
    this.firstRender = false;

  }

  renderValues(dt) {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      this.drawScaleValues();
      this.drawDates(dt);
    }
  }

  draw() {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  getItemPosition(index) {
    return index * this.step - this.xOffset + this.chartOffset
  }

  renderPopup() {
    let mouseX = this.mousePos[0];
    const popupLeft = 30;

    if (mouseX < 0) {
      this.popupEl.innerHTML = '';
      this.popupEl.style.transform = 'translateX(-200%)';
      this.valueIndex = -1;
      return;
    }

    const stMouse = mouseX / this.chartWidth - this.chartOffset;
    const valueIndex = Math.round(this.totalItemsInFrame * this.xOffset + stMouse / this.step);
    const itemPosition = this.getItemPosition(valueIndex) * this.chartWidth;

    if (valueIndex >= this.chartData.length || valueIndex < 0 || itemPosition < 0 || itemPosition > this.canvasPos.width) {
      this.popupEl.innerHTML = '';
      this.popupEl.style.transform = 'translateX(-200%)';
      this.valueIndex = -1;
      return;
    }

    if (valueIndex !== this.valueIndex) {
      this.popupEl.style.display = 'block';
      this.popupEl.innerHTML = this.popupHTML(valueIndex);
      this.valueIndex = valueIndex;
      const rect = this.popupEl.getBoundingClientRect();

      let left = itemPosition;

      const maxValue = this.chartData.columns.reduce((acc, c) => {
        if (!c.active) {
          return acc;
        }
        return acc > c.values[valueIndex] ? acc : c.values[valueIndex];
      }, 0);

      const dMax = maxValue / this.maxValue;

      if (rect.width + itemPosition > this.canvasPos.width) {
        left = itemPosition - rect.width + 20;
      } else if (left - popupLeft < 0 || dMax > 0.7) {
        left = itemPosition + popupLeft + 10;
      }

      this.popupEl.style.transform = 'translateX(' + left + 'px)';
    }
  }
}

// Class to render selection control
class ControlPlot extends Plot {
  static MIN_DIFF = 0.05;

  static DEFAULT_OPTIONS = {
    rectTopThickness: 2,
    rectLeftThickness: 7,
    rectColor: [],

    substrateColor: [],
  };

  constructor(...args) {
    super(...args);
    this.initInteractive();
  }

  init(options) {
    super.init(options);

    const gl = this.gl;
    this.uniforms = Object.assign(this.uniforms, {
      rectTopThickness: gl.getUniformLocation(this.program, 'u_rect_top_thickness'),
      rectLeftThickness: gl.getUniformLocation(this.program, 'u_rect_left_thickness'),
      drawRect: gl.getUniformLocation(this.program, 'u_draw_rect'),
      rect: gl.getUniformLocation(this.program, 'u_rect'),
      rectColor: gl.getUniformLocation(this.program, 'u_rect_color'),
      substrateColor: gl.getUniformLocation(this.program, 'u_substrate_color'),
      fill: gl.getUniformLocation(this.program, 'u_fill'),
    });

    this.options = Object.assign(this.options, options, ControlPlot.DEFAULT_OPTIONS);

    this.gl.uniform1f(this.uniforms.drawRect, 1);
    this.gl.uniform1f(this.uniforms.rectTopThickness, options.rectTopThickness * this.DPI);
    this.gl.uniform1f(this.uniforms.rectLeftThickness, options.rectLeftThickness * this.DPI);

    this.gl.uniform1f(this.uniforms.xPadding, 0);
  }

  initInteractive() {
    this.left = 0;
    this.right = 1;

    this.drag = '';
    this.startDragPos = 0;
    this.startLeft = 0;
    this.startRight = 1;

    this.gl.canvas.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleDocMouseMove);
    document.addEventListener('mouseup', this.handleDocMouseUp);
  }

  handleMouseDown = (event) => {
    const offset = event.pageX - this.canvasPos.left;

    const rectPositionLeft = this.left * this.canvasPos.width;
    const rectPositionRight = this.right * this.canvasPos.width;

    if (Math.abs(rectPositionLeft - offset) < 10) {
      this.drag = 'left';
    }

    if (Math.abs(rectPositionRight - offset) < 10) {
      this.drag = 'right';
    }

    if (!this.drag && offset > rectPositionLeft && offset < rectPositionRight) {
      this.drag = 'center';
    }

    if (this.drag) {
      this.startDragPos = event.pageX;
      this.startLeft = this.left;
      this.startRight = this.right;
    }
  };

  handleDocMouseMove = (event) => {
    if (!this.drag) {
      return;
    }

    const delta = event.pageX - this.startDragPos;
    const normDelta = delta / this.canvasPos.width;

    let left = this.startLeft;
    let right = this.startRight;

    switch (this.drag) {
      case 'left':
        left = Math.max(0, this.startLeft + normDelta);
        break;
      case 'right':
        right = Math.min(1, this.startRight + normDelta);
        break;
      case 'center':
        left = Math.max(0, this.startLeft + normDelta);
        right = Math.min(1, this.startRight + normDelta);
        break;
    }

    if (right - left >= ControlPlot.MIN_DIFF) {
      this.left = left;
      this.right = right;
    }
  };

  handleDocMouseUp = () => {
    this.drag = '';
  };

  setTheme({rectColor, substrateColor, ...etc }) {
    super.setTheme({ ...etc });
    this.gl.uniform3fv(this.uniforms.rectColor, rectColor);
    this.gl.uniform3fv(this.uniforms.substrateColor, substrateColor);
  }

  setSelection(left, right) {
    this.left = left;
    this.right = right;
  }

  getMaxValueInPosition(column) {
    return this.getMaxValue(column.max);
  }

  processColumn(c, index, ...args) {
    super.processColumn(c, index, ...args);
    this.gl.uniform2fv(this.uniforms.scaleDraw, [0, 0]); // TODO: fix, low priority;
    this.gl.uniform1f(this.uniforms.fill, Number(!index));
  }

  storeRenderState() {
    this.renderState = {
      left: this.left,
      right: this.right,
    };
  }

  shouldRender() {
    return (
      !this.maxValue ||
      this.animationsCount ||
      this.left !== this.renderState.left ||
      this.right !== this.renderState.right
    );
  }

  render(...args) {
    this.gl.uniform2fv(this.uniforms.rect, [this.left, this.right]);
    super.render(...args);
  }

  renderValues() {};
  renderPopup() {};
}
