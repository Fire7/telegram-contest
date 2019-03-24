const CHART_DATA_SRC = 'chart_data.json';
const VERTEX_SHADER_SRC = 'vertex.glsl';
const FRAGMENT_SHADER_SRC = 'fragment.glsl';
const DATA_TEXTURE_SIZE = 32;
const LIGHT_THEME = {
  rectColor: [222, 234, 242],
  bgColor: [255, 255, 255],
  substrateColor: [245, 249, 251],
  scaleColor: [204, 204, 204],
  textColor: '#A8B1B7',
};
const DARK_THEME = {
  rectColor: [66, 86, 105],
  bgColor: [37, 47, 61],
  substrateColor: [32, 42, 55],
  scaleColor: [42, 53, 67],
  textColor: '#566776',
};

const bodyElem = document.getElementsByTagName('body')[0];
const mainElem = document.getElementsByTagName('main')[0];

let nightMode = false;

function parseChartData(data) {
  return data.map((data, idx) => {
    const res = {
      id: `chart_${idx}`,
      columns: [],
      timestamps: [],
      step: 0,
      length: 0,
    };

    data.columns.forEach(arr => {
      const label = arr[0];
      const values = arr.slice(1);
      const type = data.types[label];

      switch (type) {
        case 'x':
          res.timestamps = values;
          res.length = res.timestamps.length;
          res.step = 1 / (res.length - 1);
          break;
        case 'line':
          const column = {
            active: true,
            label,
            name: data.names[label],
            color: data.colors[label],
            colorRGB: hexToRgb(data.colors[label]),
            values,
          };

          const max = Math.max.apply(null, values);
          const normalData = values.map(v => v / max);

          const normalBuffer = new Uint8Array(DATA_TEXTURE_SIZE * DATA_TEXTURE_SIZE * 3);
          normalData.forEach((val, idx) => {
            writeValueToBuffer(normalBuffer, val, idx);
          });

          column.max = max;
          column.normalData = normalData;
          column.normalBuffer = normalBuffer;
          res.columns.push(column);
        break;
        }
    });
    return res;
  });
}

let resizeTimeout = 0;
let width = mainElem.clientWidth;

let charts = [];

function doResize() {
  console.log('doResize', width !== mainElem.clientWidth);
  if (width !== mainElem.clientWidth) {

    index = 0;
    width = mainElem.clientWidth;
    requestAnimationFrame(resizeCharts);
  }
}

let index = 0;
function resizeCharts() {
  if (charts[index]) {
    charts[index++].resize(mainElem.clientWidth);
    requestAnimationFrame(resizeCharts);
  }
}

async function main() {
  const [
    vertexShaderSource,
    fragmentShaderSource,
    chartDataRaw
  ] = await Promise.all([
    loadFromSrc(VERTEX_SHADER_SRC),
    loadFromSrc(FRAGMENT_SHADER_SRC),
    loadFromSrc(CHART_DATA_SRC, true)
  ]);

  const chartData = parseChartData(chartDataRaw);

  Plot.DATA_TEXTURE_SIZE = DATA_TEXTURE_SIZE;
  Plot.VERTEX_SHADER_SRC = vertexShaderSource;
  Plot.FRAGMENT_SHADER_SRC = fragmentShaderSource;

  charts = chartData.map((data, index) => {
    return new Chart(document.getElementById('chart' + (index + 1)), data, LIGHT_THEME);
  });

  const themeSwitcher = document.getElementById('switch_theme');
  themeSwitcher.addEventListener('click', () => {
    nightMode = !nightMode;
    themeSwitcher.innerText = nightMode ? 'Switch to Day Mode' : 'Switch to Night Mode';
    bodyElem.classList.toggle('dark-theme', nightMode);
    const THEME = nightMode ? DARK_THEME : LIGHT_THEME;
    charts.forEach(c => c.setTheme(THEME));
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(doResize, 400);
  });
}

main();
