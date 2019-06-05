function loadFromSrc(src, json = false) {
    return fetch(src).then(r => json ? r.json() : r.text());
}

function roundInt(val, plus) {
  let k;
  if (val < 20) {
    k = 1;
  } else if (val < 100) {
    k = 2;
  } else if (val < 500) {
    k = 20;
  } else if (val < 1000) {
    k = 50;
  } else {
    k = Math.pow(10, val.toString().length - 2);
  }

  let d = (val / k) + plus >> 0;
  return d * k;
}

function getPageX(event) {
  return event.touches ? event.touches[0].pageX : event.pageX;
}

function getPageY(event) {
  return event.touches ? event.touches[0].pageY : event.pageY;
}

function parseChartData(data, idx) {
  const res = {
    path: data.path,
    id: `${data.prefix || 'chart'}_${idx}`,
    name: data.name,
    columns: [],
    timestamps: [],
    step: 0,
    length: 0,
    stacked: Boolean(data.stacked),
    percentage: Boolean(data.percentage),
    yScaled: Boolean(data.y_scaled),
    min: 99999999999,
    max: 0,
    sums: new Array(data.columns[0].length).fill(0),
  };


  let columnIndex = 0;



  data.columns.forEach(arr => {
    const label = arr[0];
    const values = arr.slice(1);
    const type = data.types[label];

    // TODO: rewrite!!!!!;
    switch (type) {
      case 'x':
        res.timestamps = values;
        res.length = res.timestamps.length;
        res.step = 1 / (res.length - 1);
        break;
      case 'line': {
        const column = {
          active: true,
          label,
          name: data.names[label],
          color: data.colors[label],
          // colorRGB: hexToRgb(data.colors[label]),
          values,
          index: columnIndex++,
          type: 'line',
        };

        const max = Math.max.apply(null, values);
        const min = Math.min.apply(null, values);
        const normalData = values.map(v => v / max);

        res.max = max > res.max ? max : res.max;
        res.min = min < res.min ? min : res.min;

        column.max = max;
        column.min = min;
        column.normalData = normalData;
        res.columns.push(column);
        break;
      }
      case 'bar': {
        const column = {
          active: true,
          label,
          name: data.names[label],
          color: data.colors[label],
          values,
          index: columnIndex++,
          type: 'bar',
        };

        if (data.stacked) {
          values.forEach((v, i) => res.sums[i] += v);
          column.max = 0;
        } else {
          const max = Math.max.apply(null, values);
          const normalData = values.map(v => v / max);

          column.max = max;
          column.normalData = normalData;
        }

        res.bar = true;
        res.columns.push(column);

        break;
      }
      case 'area': {
        const column = {
          active: true,
          label,
          name: data.names[label],
          color: data.colors[label],
          values,
          index: columnIndex++,
          type: 'area',
        };

        res.columns.push(column);
      }
    }

    if (data.stacked) {
      if (!data.percentage) {
        res.max = Math.max.apply(null, res.sums);

        res.columns.forEach(column => {
          column.normalData = column.values.map(v => v / res.max);
        })
      }
    }


  });
  return res;
};

class Popup {
  constructor(el, onClick) {
    const MAX_ELEMENTS_CNT = 8;

    this.rootEl = el;

    this.rootEl.addEventListener('click', onClick);

    el.innerHTML =  `
      <div class="title">
        <span class="left bold"></span>
        <span class="right"></span>
      </div>
      ${Array.apply(null, { length: MAX_ELEMENTS_CNT }).map(() => `
          <div class="value">
            <snan class="left bold pre"></snan>
            <snan class="left"></snan>
            <snan class="right bold"></snan>
          </div>
      `).join('')}
      </div>
    `;

    this.titleLeft = el.querySelector('.title .left');
    this.titleRight = el.querySelector('.title .right');

    this.values = [];

    el.querySelectorAll('.value').forEach(valEl => {
      const lefts = valEl.querySelectorAll('.left');
      const right = valEl.querySelector('.right');

      this.values.push({
        prefix: lefts[0],
        name: lefts[1],
        value: right,
      });
    });
  }

  draw(title, rightTitle, nextValues) {

    /*
    this.rootEl.innerHTML = `
      <div class="title">
        <span class="left bold">${title}</span>
        <span class="right">${rightTitle}</span>
      </div>

     ${nextValues.map(({ prefix, name, color, value }) => `
        <div class="value">
            <snan class="left bold pre">${prefix || ''}</snan>
            <snan class="left">${name}</snan>
            <snan class="right bold" style="color:${color};">${value}</snan>
          </div>


     `).join('')}
    `;

    */



    this.titleLeft.textContent = title;
    this.titleRight.textContent = rightTitle;

    this.values.forEach(({ prefix, name , value}, i) => {
      const setValue = nextValues[i] || {};

      prefix.textContent = setValue.prefix || '';
      name.textContent = setValue.name || '';

      value.style.color = setValue.color || '';
      value.textContent = setValue.value;
    });


  }

  setPosition(pix) {
    this.rootEl.style.transform = 'translateX(' + (pix >> 0) + 'px)';
  }
}

class Tween {
  //TODO: remove
  static to(...args) {
    const t = new Tween();
    t.to(...args);
    return t;
  }


  constructor() {
    this.startValue = 0;
    this.targetValue = 0;
    this.value = 0;
    this.diff = 0;
    this.startTime = 0;
    this.isPositive = true;
    this.complete = true;
    this.inProgress = false;
    this.position = 0;
    this.duration = 0;
  }

  to(startValue, targetValue, startTime = 0, duration = 0) {
    this.startValue = startValue;
    this.targetValue = targetValue;
    this.value = startValue;
    this.diff = this.targetValue - this.startValue;
    this.startTime = startTime;

    this.isPositive = targetValue > startValue;

    this.complete = !this.diff;
    this.inProgress = !this.complete;
    this.position = this.complete ? 1 : 0;
    this.duration = duration;
  }

  step(d) {
    this.position = d;

    if (this.position >= 1) {
      this.position = 1;
      this.complete = true;
      this.inProgress = false;
      this.value = this.targetValue;
      return this.value;
    }

    this.value = this.getValue(d);
    return this.value
  }

  stepTime(time) {
    this.position = (time - this.startTime) / this.duration;

    if (this.position >= 1) {
      this.position = 1;
      this.complete = true;
      this.inProgress = false;
      this.value = this.targetValue;
      return this.value;
    }

    this.value = this.getValue(this.position);
    return this.value;
  }

  stepPosition(time) {
    this.position = (time - this.startTime) / this.duration;

    if (this.position >= 1) {
      this.position = 1;
      this.complete = true;
      this.inProgress = false;
    }

    return this.position;
  }

  getValue(position) {
    return this.startValue + this.diff * position;
  }


}
