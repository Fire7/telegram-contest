precision highp float;

#define TEXTURE_SIZE 128.0
#define TEXUTE_STEP 0.0078125

// Theme:
uniform vec3 u_bg_color;
uniform vec3 u_substrate_color;
uniform vec3 u_rect_color;

uniform vec2 u_resolution;// Canvas resolution
uniform float u_line_smooth;
uniform float u_line_thickness;
uniform sampler2D u_texture;//  Data texture

uniform float u_total_items;

uniform float u_x_step;
uniform float u_x_offset;

uniform vec2 u_rect;
uniform float u_rect_top_thickness;
uniform float u_rect_left_thickness;

uniform float u_y_scale2[4];
uniform vec3 u_line_color2[4];
uniform float u_line_opacity2[4];
uniform bool u_line_draw[4];


float distance_to_line_segment(vec2 p, vec2 a, vec2 b){
    vec2 ba = b - a;
    float u = clamp(dot(p - a, ba)/dot(ba, ba), 0.0, 1.0);
    vec2 q = a + u*ba;
    return distance(p, q);
}

float smooth_line(float dist, float radius, float d) {
    return smoothstep(radius, radius - d, dist);
}

float parseFloat(float a, float b, float c) {
    return (a * 65280. + b * 255. + c) / 65281.;
}

vec2 getTextureCoordByIndex(float index, float unit) {
    float i =  floor(index / TEXTURE_SIZE) * TEXUTE_STEP + unit;
    float j =  floor(mod(index, TEXTURE_SIZE)) * TEXUTE_STEP;
    return vec2(j, i);
}

vec2 getPointByIndex(float index, float textureUnit, float yScale) {
    vec4 value = texture2D(u_texture, getTextureCoordByIndex(index, textureUnit));
    float x = index * u_x_step - u_x_offset;
    float y = parseFloat(value.r, value.g, value.b) * yScale;
    return vec2(x, y);
}

vec4 plot(vec4 color, float currPointIndex, float index, vec3 lineColor, float yScale, float lineOpacity, float firstItem, float lastItem, float outOfRange, vec2 chartR, vec4 bgColor) {

    vec2 P = gl_FragCoord.xy;

    vec2 currPointPix = getPointByIndex(currPointIndex, index, yScale) * chartR;
    vec2 prevPointPix = getPointByIndex(currPointIndex - 1., index, yScale) * chartR;
    vec2 nextPointPix = getPointByIndex(currPointIndex + 1., index, yScale) * chartR;

    float minDist = min(
    firstItem * 1000. + distance_to_line_segment(P.xy, prevPointPix, currPointPix),
    lastItem * 1000. + distance_to_line_segment(P.xy, currPointPix, nextPointPix)
    );

    if (u_line_thickness - minDist > 0.) {
        color = mix(
        color,
        vec4(lineColor, lineOpacity),
        outOfRange * smooth_line(minDist, u_line_thickness, u_line_thickness - u_line_smooth)
        );
    }

    return color;
}

void main() {
    vec2 R = u_resolution.xy;
    vec2 st = gl_FragCoord.xy / R;

    // Handle left - right padding:
    vec2 chartR = R;
    vec2 chartSt = gl_FragCoord.xy / chartR;

    vec4 bgColor = vec4(u_bg_color, 0.);
    vec4 color = bgColor;

    vec2 P = gl_FragCoord.xy;


    // Selection rect border left and right:

    vec2 rect = u_rect * R.x;
    vec4 substrateColor = vec4(u_substrate_color, 0.05);
    vec4 rectColor = vec4(u_rect_color, 1.);

    float leftRectBorder =
    step(rect.x, P.x) *
    (1. - step(rect.x + u_rect_left_thickness, P.x));

    float rightRectBorder =
    step(rect.y - u_rect_left_thickness, P.x) *
    (1. - step(rect.y, P.x));

    float leftRightRectBorders = max(leftRectBorder, rightRectBorder);

    color = mix(color, rectColor, leftRightRectBorders);

    // Selection rect end;
    float totalItemsInFrame = 1. / u_x_step;

    // Selected value mouse lime:
    float currPointIndex = floor(totalItemsInFrame * u_x_offset +  /*st.x*/chartSt.x / u_x_step + 0.5);


    float firstItem = 1. - step(0., currPointIndex - 1.);
    float lastItem = step(0., currPointIndex + 1. - u_total_items);


    float outOfRange =  step(0., currPointIndex) *  (1. - step(0., currPointIndex - u_total_items));


    color = u_line_draw[0]
    ? plot(color, currPointIndex, 0., u_line_color2[0], u_y_scale2[0], u_line_opacity2[0], firstItem, lastItem, outOfRange, chartR, bgColor)
    : color;
    color = u_line_draw[1]
    ? plot(color, currPointIndex, 0.25, u_line_color2[1], u_y_scale2[1], u_line_opacity2[1], firstItem, lastItem, outOfRange, chartR, bgColor)
    : color;
    color = u_line_draw[2]
    ? plot(color, currPointIndex, 0.5, u_line_color2[2], u_y_scale2[2], u_line_opacity2[2], firstItem, lastItem, outOfRange, chartR, bgColor)
    : color;
    color = u_line_draw[3]
    ? plot(color, currPointIndex, 0.75, u_line_color2[3], u_y_scale2[3], u_line_opacity2[3], firstItem, lastItem, outOfRange, chartR, bgColor)
    : color;


    float topBottomSubstrateBorder =
    max(
        step(R.y - u_rect_top_thickness, P.y),
        (1. - step(u_rect_top_thickness, P.y))
    )
    * step(rect.x, P.x) *
    step(P.x, rect.y);


    color = mix(
        color,
        rectColor,
        topBottomSubstrateBorder
    );

    substrateColor = vec4(u_substrate_color, 1.);
    float leftSubstrate = step(P.x, rect.x);
    float rightSubstrate = step(rect.y, P.x);

    // Substrate
    color = mix(
        color,
        substrateColor,
        max(leftSubstrate, rightSubstrate) *
        0.75
    );

    gl_FragColor = color;
    return;
}

