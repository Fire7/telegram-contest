precision highp float;

#define TEXTURE_SIZE 128.0
#define TEXUTE_STEP 0.0078125

// Theme:
uniform vec3 u_bg_color;
uniform vec3 u_mouseline_color;

uniform vec2 u_mouse;// Положение курсора мыши в пикселях

uniform vec2 u_resolution;// Canvas resolution
uniform float u_line_smooth;
uniform float u_line_thickness;
uniform sampler2D u_texture;//  Data texture

uniform float u_total_items;

uniform float u_x_step;
uniform float u_x_offset;
uniform float u_x_padding;

// possibility to draw 2 axis
uniform vec2 u_scale_step;
uniform vec2 u_scale_draw;
uniform vec2 u_scale_opacity;
uniform vec3 u_scale_color[2];
uniform vec2 u_scale_thickness;
uniform vec2 u_scale_offset_x;
uniform vec2 u_scale_count;

uniform float u_selected_circle_radius;

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

float circle(vec2 coord, vec2 center, float radius, float d) {
    float distanceToCenter = distance(coord, center);
    return smoothstep(distanceToCenter - d, distanceToCenter, radius);
}

float parseFloat(float a, float b, float c) {
    return (a * 65280. + b * 255. + c) / 65281.;
}

float scale(float pix, float offset, float count, float xOffset, float thickness) {
    pix += thickness * 0.5;
    count = step(0., count - pix / offset);
    float axis = step(0., thickness - (mod(pix, offset)));
    return xOffset * count * axis;
}


vec2 getTextureCoordByIndex(float index, float unit) {
    float i =  floor(index / TEXTURE_SIZE) * TEXUTE_STEP + unit;
    float j =  floor(mod(index, TEXTURE_SIZE)) * TEXUTE_STEP;
    return vec2(j, i);
}

vec2 getPointByIndex(float index, float padding, float textureUnit, float yScale) {
    vec4 value = texture2D(u_texture, getTextureCoordByIndex(index, textureUnit));
    float x = index * u_x_step - u_x_offset + padding;
    float y = parseFloat(value.r, value.g, value.b) * yScale;
    return vec2(x, y);
}

vec4 plot(vec4 color, float currPointIndex, float index, vec3 lineColor, float yScale, float lineOpacity, float firstItem, float lastItem, float outOfRange, float stPadding, vec2 chartR, float selectedPointIndex, bool drawSelection, vec4 bgColor) {

    vec2 P = gl_FragCoord.xy;

    vec2 currPointPix = getPointByIndex(currPointIndex, stPadding, index, yScale) * chartR;
    vec2 prevPointPix = getPointByIndex(currPointIndex - 1., stPadding, index, yScale) * chartR;
    vec2 nextPointPix = getPointByIndex(currPointIndex + 1., stPadding, index, yScale) * chartR;

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

    vec2 selectedPointPix = getPointByIndex(selectedPointIndex, stPadding, index, yScale) * chartR;
    if (drawSelection && u_selected_circle_radius - distance(P, selectedPointPix) > -2.) {
        // Selected value draw:
        color = mix(
        color,
        vec4(lineColor, lineOpacity),
        circle(P.xy, selectedPointPix, u_selected_circle_radius, 2.)
        );

        color = mix(
        color,
        vec4(bgColor.rgb, 1.),
        circle(P.xy, selectedPointPix, u_selected_circle_radius - u_line_thickness - 1., 2.)
        );
    }

    return color;
}

void main() {
    vec2 R = u_resolution.xy;
    vec2 st = gl_FragCoord.xy / R;

    vec2 stMouse = u_mouse / R;


    // Handle left - right padding:
    vec2 chartR = R;
    chartR.x -= u_x_padding * 2.;
    float stPadding = u_x_padding / chartR.x;
    vec2 chartSt = gl_FragCoord.xy / chartR;
    chartSt.x -= stPadding;

    stMouse = u_mouse / chartR;
    stMouse.x -= stPadding;

    vec4 bgColor = vec4(u_bg_color, 0.);
    vec4 color = bgColor;

    vec2 P = gl_FragCoord.xy;

    // Scales:
    float scalesXOffset = step(u_scale_offset_x[0], P.x) * step(P.x, R.x - u_scale_offset_x[0]);

    color = mix(
        color,
        vec4(u_scale_color[0], u_scale_opacity[0]),
        scale(P.y, u_scale_step[0], u_scale_count[0], scalesXOffset, u_scale_thickness[0])
    );


    if (u_scale_draw[1] == 1.) {
        color = mix(
            color,
            vec4(u_scale_color[1], u_scale_opacity[1]),
            scale(P.y, u_scale_step[1], u_scale_count[1], scalesXOffset, u_scale_thickness[1])
        );
    }

    color = mix(
        color,
        vec4(u_scale_color[0], 1.),
        u_scale_draw[0] * scalesXOffset * step(u_scale_offset_x[0], P.x) * step(0., u_scale_thickness[0] - P.y)
    );

    // scales end


    // Selection rect border left and right:

    // Selection rect end;
    float totalItemsInFrame = 1. / u_x_step;

    // Selected value mouse lime:
    float selectedPointIndex = floor(totalItemsInFrame * u_x_offset + stMouse.x / u_x_step + 0.5);
    float currPointIndex = floor(totalItemsInFrame * u_x_offset +  /*st.x*/chartSt.x / u_x_step + 0.5);


    float firstItem = 1. - step(0., currPointIndex - 1.);
    float lastItem = step(0., currPointIndex + 1. - u_total_items);


    float outOfRange =  step(0., currPointIndex) *  (1. - step(0., currPointIndex - u_total_items));

    float firstItemSelected = step(0., selectedPointIndex);
    float lastItemSelected = 1. - step(0., selectedPointIndex - u_total_items);
    float drawsSelection = firstItemSelected * lastItemSelected;
    bool drawsSelectionB = drawsSelection == 1.;


    if (drawsSelectionB) {
        float selectedPointX = (selectedPointIndex * u_x_step - u_x_offset + stPadding) * chartR.x;

        float mouseLine =
            step(selectedPointX - u_scale_thickness[0], P.x) *
            (1. - step(selectedPointX + u_scale_thickness[0], P.x));


        color = mix(
            color,
            vec4(u_mouseline_color, 1.),
            mouseLine
        );
    }

    color = u_line_draw[0]
        ? plot(color, currPointIndex, 0., u_line_color2[0], u_y_scale2[0], u_line_opacity2[0], firstItem, lastItem, outOfRange, stPadding, chartR, selectedPointIndex, drawsSelectionB, bgColor)
        : color;
    color = u_line_draw[1]
        ? plot(color, currPointIndex, 0.25, u_line_color2[1], u_y_scale2[1], u_line_opacity2[1], firstItem, lastItem, outOfRange, stPadding, chartR, selectedPointIndex, drawsSelectionB, bgColor)
        : color;
    color = u_line_draw[2]
        ? plot(color, currPointIndex, 0.5, u_line_color2[2], u_y_scale2[2], u_line_opacity2[2], firstItem, lastItem, outOfRange, stPadding, chartR, selectedPointIndex, drawsSelectionB, bgColor)
        : color;
    color = u_line_draw[3]
        ? plot(color, currPointIndex, 0.75, u_line_color2[3], u_y_scale2[3], u_line_opacity2[3], firstItem, lastItem, outOfRange, stPadding, chartR, selectedPointIndex, drawsSelectionB, bgColor)
        : color;

    gl_FragColor = color;
    return;
}

