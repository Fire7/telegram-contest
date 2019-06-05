const CHART_DATA_SRC = 'chart_data.json';
const VERTEX_SHADER_SRC = 'vertex.glsl';
const FRAGMENT_SHADER_SRC = 'fragment.glsl';
const FRAGMENT_CONTROLS_SGADER_SRC = 'fragment-controls.glsl';
const DATA_TEXTURE_SIZE = 32;
/*const LIGHT_THEME = {
  rectColor: [222, 234, 242],
  bgColor: [255, 255, 255],
  substrateColor: [245, 249, 251],
  scaleColor: [204, 204, 204],
  mouseLineColor: [224,	230,	234],
  textColor: '#A8B1B7',
};
const DARK_THEME = {
  rectColor: [66, 86, 105],
  bgColor: [37, 47, 61],
  substrateColor: [32, 42, 55],
  scaleColor: [42, 53, 67],
  mouseLineColor: [61, 74, 89],
  textColor: '#566776',
};*/

const LIGHT_THEME = {
  rectColor: 'rgba(70, 150, 201, 0.2)',
  bgColor: '#ffffff',
  substrateColor: 'rgba(232, 241, 245, 0.7)',
  scaleColor: '#cccccc',
  mouseLineColor: '#e0e6ea',
  textColor: '#A8B1B7',
};
const DARK_THEME = {
  rectColor: 'rgba(145, 198, 235, 0.3)',
  bgColor: '#252f3d',
  substrateColor: 'rgba(26, 39, 51, 0.6)',
  scaleColor: '#2a3543',
  mouseLineColor: '#3d4a59',
  textColor: '#566776',
};

const bodyElem = document.getElementsByTagName('body')[0];
const mainElem = document.getElementsByTagName('main')[0];

let nightMode = false;

let resizeTimeout = 0;
let width = mainElem.clientWidth;

let charts = [];

function doResize() {
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
    fragmentControlsShaderSource,
    chartDataRaw,
    chart1Data,
    chart2Data,
    chart3Data,
    chart4Data,
    chart5Data,
  ] = await Promise.all([
    loadFromSrc(VERTEX_SHADER_SRC),
    loadFromSrc(FRAGMENT_SHADER_SRC),
    loadFromSrc(FRAGMENT_CONTROLS_SGADER_SRC),
    loadFromSrc(CHART_DATA_SRC, true),
    loadFromSrc('data/1/overview.json', true),
    loadFromSrc('data/2/overview.json', true),
    loadFromSrc('data/3/overview.json', true),
    loadFromSrc('data/4/overview.json', true),
    loadFromSrc('data/5/overview.json', true),
  ]);

  chart1Data.path = '1';
  chart1Data.name = 'Followers';
  chart2Data.path = '2';
  chart2Data.name = 'Interactions';
  chart3Data.path = '3';
  chart3Data.name = 'Messages';
  chart4Data.path = '4';
  chart4Data.name = 'Views';
  chart5Data.path = '5';
  chart5Data.name = 'Apps';

  const newChartData = [chart1Data, chart2Data, chart3Data, chart4Data, chart5Data];
  window['$newChartData'] = newChartData;


  const chartData = [chart1Data, chart2Data, chart3Data, chart4Data, chart5Data].map(parseChartData);//newChartData.slice(0,1).map(parseChartData);
  // const chartData = chartDataRaw.map(parseChartData);//newChartData.slice(0,1).map(parseChartData);


  charts = chartData.map((data, index) => {
    return new Chart2(document.getElementById('chart' + (index + 1)), data, LIGHT_THEME);
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
