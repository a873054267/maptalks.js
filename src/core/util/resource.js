import { isNode } from './env';
import Browser from '../Browser';
import { extend, isNil, isArray, isNumber, isString } from './common';
import { isURL, extractCssUrl } from './util';
import * as utils from 'utils';
import { Symbolizer } from 'renderer/vectorlayer/symbolizers';

export function translateToSVGStyles(s) {
    var result = {
        'stroke': {
            'stroke': s['markerLineColor'],
            'stroke-width': s['markerLineWidth'],
            'stroke-opacity': s['markerLineOpacity'],
            'stroke-dasharray': null,
            'stroke-linecap': 'butt',
            'stroke-linejoin': 'round'
        },
        'fill': {
            'fill': s['markerFill'],
            'fill-opacity': s['markerFillOpacity']
        }
    };
    //vml和svg对linecap的定义不同
    if (result['stroke']['stroke-linecap'] === 'butt') {
        if (Browser.vml) {
            result['stroke']['stroke-linecap'] = 'flat';
        }
    }
    if (result['stroke']['stroke-width'] === 0) {
        result['stroke']['stroke-opacity'] = 0;
    }
    return result;
}

export function getMarkerPathBase64(symbol) {
    if (!symbol['markerPath']) {
        return null;
    }
    var op = 1,
        styles = translateToSVGStyles(symbol);
    //context.globalAlpha doesn't take effect with drawing SVG in IE9/10/11 and EGDE, so set opacity in SVG element.
    if (isNumber(symbol['markerOpacity'])) {
        op = symbol['markerOpacity'];
    }
    if (isNumber(symbol['opacity'])) {
        op *= symbol['opacity'];
    }
    var p, svgStyles = {};
    if (styles) {
        for (p in styles['stroke']) {
            if (styles['stroke'].hasOwnProperty(p)) {
                if (!isNil(styles['stroke'][p])) {
                    svgStyles[p] = styles['stroke'][p];
                }
            }
        }
        for (p in styles['fill']) {
            if (styles['fill'].hasOwnProperty(p)) {
                if (!isNil(styles['fill'][p])) {
                    svgStyles[p] = styles['fill'][p];
                }
            }
        }
    }

    var pathes = isArray(symbol['markerPath']) ? symbol['markerPath'] : [symbol['markerPath']];
    var i, path, pathesToRender = [];
    for (i = 0; i < pathes.length; i++) {
        path = isString(pathes[i]) ? {
            'path': pathes[i]
        } : pathes[i];
        path = extend({}, path, svgStyles);
        path['d'] = path['path'];
        delete path['path'];
        pathesToRender.push(path);
    }
    var svg = ['<svg version="1.1"', 'xmlns="http://www.w3.org/2000/svg"'];
    if (op < 1) {
        svg.push('opacity="' + op + '"');
    }
    // if (symbol['markerWidth'] && symbol['markerHeight']) {
    //     svg.push('height="' + symbol['markerHeight'] + '" width="' + symbol['markerWidth'] + '"');
    // }
    if (symbol['markerPathWidth'] && symbol['markerPathHeight']) {
        svg.push('viewBox="0 0 ' + symbol['markerPathWidth'] + ' ' + symbol['markerPathHeight'] + '"');
    }
    svg.push('preserveAspectRatio="none"');
    svg.push('><defs></defs>');

    for (i = 0; i < pathesToRender.length; i++) {
        var strPath = '<path ';
        for (p in pathesToRender[i]) {
            if (pathesToRender[i].hasOwnProperty(p)) {
                strPath += ' ' + p + '="' + pathesToRender[i][p] + '"';
            }
        }
        strPath += '></path>';
        svg.push(strPath);
    }
    svg.push('</svg>');
    var b64 = 'data:image/svg+xml;base64,' + btoa(svg.join(' '));
    return b64;
}

/**
 * Get external resources from the given symbol
 * @param  {Object} symbol      - symbol
 * @param  {Boolean} toAbsolute - whether convert url to aboslute
 * @return {String[]}           - resource urls
 */
export function getExternalResources(symbol, toAbsolute) {
    if (!symbol) {
        return null;
    }
    var symbols = symbol;
    if (!isArray(symbol)) {
        symbols = [symbol];
    }
    var resources = [];
    var props = Symbolizer.resourceProperties,
        i, ii, iii, res, resSizeProp;
    var w, h;
    for (i = symbols.length - 1; i >= 0; i--) {
        symbol = symbols[i];
        if (!symbol) {
            continue;
        }
        if (toAbsolute) {
            symbol = convertResourceUrl(symbol);
        }
        for (ii = 0; ii < props.length; ii++) {
            res = symbol[props[ii]];
            if (utils.isFunctionDefinition(res)) {
                res = utils.getFunctionTypeResources(res);
            }
            if (!res) {
                continue;
            }
            if (!isArray(res)) {
                res = [res];
            }
            for (iii = 0; iii < res.length; iii++) {
                if (res[iii].slice(0, 4) === 'url(') {
                    res[iii] = extractCssUrl(res[iii]);
                }
                resSizeProp = Symbolizer.resourceSizeProperties[ii];
                resources.push([res[iii], symbol[resSizeProp[0]], symbol[resSizeProp[1]]]);
            }
        }
        if (symbol['markerType'] === 'path' && symbol['markerPath']) {
            w = utils.isFunctionDefinition(symbol['markerWidth']) ? 200 : symbol['markerWidth'];
            h = utils.isFunctionDefinition(symbol['markerHeight']) ? 200 : symbol['markerHeight'];
            if (utils.isFunctionDefinition(symbol['markerPath'])) {
                res = utils.getFunctionTypeResources(symbol['markerPath']);
                var path = symbol['markerPath'];
                for (iii = 0; iii < res.length; iii++) {
                    symbol['markerPath'] = res[iii];
                    resources.push([getMarkerPathBase64(symbol), w, h]);
                }
                symbol['markerPath'] = path;
            } else {
                resources.push([getMarkerPathBase64(symbol), w, h]);
            }
        }
    }
    return resources;
}

/**
 * Convert symbol's resources' urls from relative path to an absolute path.
 * @param  {Object} symbol
 * @private
 */
export function convertResourceUrl(symbol) {
    if (!symbol) {
        return null;
    }

    var s = symbol;
    if (isNode) {
        return s;
    }
    var props = Symbolizer.resourceProperties;
    var res;
    for (var ii = 0, len = props.length; ii < len; ii++) {
        res = s[props[ii]];
        if (!res) {
            continue;
        }
        s[props[ii]] = _convertUrlToAbsolute(res);
    }
    return s;
}

function _convertUrlToAbsolute(res) {
    if (utils.isFunctionDefinition(res)) {
        var stops = res.stops;
        for (var i = 0; i < stops.length; i++) {
            stops[i][1] = _convertUrlToAbsolute(stops[i][1]);
        }
        return res;
    }
    var embed = 'data:';
    if (res.slice(0, 4) === 'url(') {
        res = extractCssUrl(res);
    }
    if (!isURL(res) &&
        (res.length <= embed.length || res.substring(0, embed.length) !== embed)) {
        res = _absolute(location.href, res);
    }
    return res;
}

function _absolute(base, relative) {
    var stack = base.split('/'),
        parts = relative.split('/');
    if (relative.slice(0, 1) === 0) {
        return stack.slice(0, 3).join('/') + relative;
    } else {
        stack.pop(); // remove current file name (or empty string)
        // (omit if "base" is the current folder without trailing slash)
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] === '.')
                continue;
            if (parts[i] === '..')
                stack.pop();
            else
                stack.push(parts[i]);
        }
        return stack.join('/');
    }
}