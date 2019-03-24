const webGLUtils = {
    createShader: function(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);    // set source code to shader
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {                        // if complice succeed return shader
          return shader;
        }
        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    },

    createProgram: function (gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        const success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
          return program;
        }

        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }
};

function loadFromSrc(src, json = false) {
    return fetch(src).then(r => json ? r.json() : r.text());
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.replace('#', ''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    return [r, g, b];
}

function convertValueToTextureData(val) {
  const maxValue = 16646655; // (255 * 255 * 255 + 255 * 255 + 255)
  const secondValue = 65280; // (255 * 255 + 255)

  if (val === 1) {
    return {
      r: 255,
      g: 255,
      b: 255,
    };
  }

  const intValue = Math.round(val * maxValue);
  const r = intValue / secondValue >> 0;
  const g = intValue % secondValue / 255 >> 0;
  const b = intValue % 255;

  return {
    r,
    g,
    b,
  };
}

function writeValueToBuffer(buffer, value, offset) {
  offset *= 3;
  const { r, g, b } = convertValueToTextureData(value);
  buffer[offset] = r;
  buffer[offset + 1] = g;
  buffer[offset + 2] = b;
}
