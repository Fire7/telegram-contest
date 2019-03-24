precision mediump float;

#define TEXTURE_SIZE 32.0;
#define TEXTURE_STEP 1.0 / TEXTURE_SIZE;

// Theme:
uniform vec3 u_bg_color;
uniform vec3 u_substrate_color;
uniform vec3 u_rect_color;

uniform vec2 u_mouse;// Положение курсора мыши в пикселях

uniform vec2 u_resolution;          // Canvas resolution
uniform vec3 u_line_color;
uniform float u_line_smooth;
uniform float u_line_thickness;
uniform float u_line_opacity;//
uniform sampler2D u_texture;    //  Data texture
uniform float u_draw_rect;
uniform float u_fill;

uniform float u_total_items;

uniform float u_x_step;
uniform float u_y_scale;
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

uniform vec2 u_rect;
uniform float u_rect_top_thickness;
uniform float u_rect_left_thickness;

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

float scale(float pix, float draw, float offset, float count, float xOffset, float thickness) {
    pix += thickness * 0.5;
    count = step(0., count - pix / offset);
    float axis = step(0., thickness - (mod(pix, offset)));
    return draw * xOffset * count * axis;
}

vec2 getTextureCoordByIndex(float index) {
    float iStep = TEXTURE_STEP;
    float ts = TEXTURE_SIZE;

    float i =  floor(index / ts) * iStep;
    float j =  floor(mod (index, ts)) * iStep;

    return vec2(j, i);
}

vec2 getPointByIndex(float index, float padding) {
    vec4 value = texture2D(u_texture, getTextureCoordByIndex(index));
    float x = index * u_x_step - u_x_offset;
    x += padding;

    float y = parseFloat(value.r, value.g, value.b) * u_y_scale;
    return vec2(x, y);
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

    vec4 bgColor = vec4(u_bg_color / 255., 0.);
    vec4 color = bgColor;

    vec2 P = gl_FragCoord.xy;

    // Scales:
    float scalesXOffset = step(u_scale_offset_x[0], P.x) * step(P.x, R.x - u_scale_offset_x[0]);

    color = mix(
        color,
        vec4(u_scale_color[0] / 255., u_scale_opacity[0]),
        scale(P.y, u_scale_draw[0], u_scale_step[0], u_scale_count[0], scalesXOffset, u_scale_thickness[0])
    );

    color = mix(
        color,
        vec4(u_scale_color[1] / 255., u_scale_opacity[1]),
        scale(P.y, u_scale_draw[1], u_scale_step[1], u_scale_count[1], scalesXOffset, u_scale_thickness[1])
    );

    color = mix(
        color,
        vec4(u_scale_color[0] / 255., 1.),
        u_scale_draw[0] * scalesXOffset * step(u_scale_offset_x[0], P.x) * step(0., u_scale_thickness[0] - P.y)
    );
    // scales end



    // Selection rect border left and right:
    vec2 rect = u_rect * R.x;

    vec4 substrateColor = vec4(u_substrate_color / 255., 0.05);
    vec4 rectColor = vec4(u_rect_color / 255., 1.);

    float leftRectBorder =
    step(rect.x, P.x) *
    (1. - step(rect.x + u_rect_left_thickness, P.x));

    float rightRectBorder =
    step(rect.y - u_rect_left_thickness, P.x) *
    (1. - step(rect.y, P.x));

    float leftRightRectBorders = max(leftRectBorder, rightRectBorder);

    color = mix(color, rectColor, u_fill * leftRightRectBorders);

    // Selection rect end;
    vec3 lineColor = u_line_color / 255.;
    float line;
    float x;
    float y;
    float halfXStep = u_x_step * .5;
    float totalItemsInFrame = 1. / u_x_step;

    // Selected value:
    float selectedPointIndex = floor(totalItemsInFrame * u_x_offset + stMouse.x / u_x_step + 0.5);
    vec2 selectedPoint = getPointByIndex(selectedPointIndex, stPadding);
    vec2 selectedPointPix = selectedPoint * chartR;


    float mouseLine =
    u_scale_draw[0] *
    step(selectedPointPix.x - u_scale_thickness[0], P.x) *
    (1. - step(selectedPointPix.x + u_scale_thickness[0], P.x));

    float firstItemSelected = step(0., selectedPointIndex);
    float lastItemSelected = 1. - step(0. , selectedPointIndex - u_total_items);
    float drawsSelection = firstItemSelected * lastItemSelected;

    color = mix(
        color,
        vec4(u_scale_color[0] / 255., 1.),
        drawsSelection * mouseLine
    );


    float currPointIndex = floor(totalItemsInFrame * u_x_offset +  /*st.x*/chartSt.x / u_x_step + 0.5);
    vec2 currPoint = getPointByIndex(currPointIndex, stPadding);
    vec2 currPointPix = currPoint * chartR;

    vec2 prevPoint = getPointByIndex(currPointIndex - 1., stPadding);
    vec2 prevPointPix = prevPoint * chartR;
    vec2 nextPoint = getPointByIndex(currPointIndex + 1., stPadding);

    float firstItem = 1. - step(0., currPointIndex - 1.);
    float lastItem = step(0. , currPointIndex + 1. - u_total_items);

    vec2 nextPointPix = nextPoint * chartR;
    float minDist = min(
        firstItem * 1000. + distance_to_line_segment(P.xy, prevPointPix, currPointPix),
        lastItem * 1000. + distance_to_line_segment(P.xy, currPointPix, nextPointPix)
    );

    line = smooth_line(minDist, u_line_thickness, u_line_thickness - u_line_smooth);

    firstItem = step(0., currPointIndex);
    lastItem = 1. - step(0. , currPointIndex - u_total_items);

    color = mix(
        color,
        vec4(lineColor, u_line_opacity),
        firstItem * lastItem * line
    );


    // Selected value draw:
    color = mix(
        color,
        vec4(lineColor, u_line_opacity),
        drawsSelection * (1. - u_draw_rect) * circle(P.xy, selectedPointPix, u_selected_circle_radius, 2.)
    );

    color = mix(
        color,
        vec4(bgColor.rgb, 1.),
        drawsSelection * (1. - u_draw_rect) * circle(P.xy, selectedPointPix, u_selected_circle_radius - u_line_thickness - 1., 2.)
    );

    float topBottomSubstrateBorder =
    max(
        step(R.y - u_rect_top_thickness, P.y),
        (1. - step(u_rect_top_thickness, P.y))
    ) *
    step(rect.x, P.x) *
    step(P.x, rect.y);

    color = mix(
        color,
        rectColor,
        topBottomSubstrateBorder
    );

    substrateColor = vec4(u_substrate_color / 255., 1.);
    float leftSubstrate = step(P.x, rect.x);
    float rightSubstrate = step(rect.y, P.x);

    // Substrate
    color = mix(
        color,
        substrateColor,
        max(
            u_fill,
            u_draw_rect * sign(distance(color, bgColor))
        ) *
        max(leftSubstrate, rightSubstrate) *
        0.75 *
        u_line_opacity
    );

    gl_FragColor = color;
    return;
}

