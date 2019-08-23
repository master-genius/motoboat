/**
 * module router
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

function router (options = {}) {
    var rt = {
        ignoreSlash : true,
        methodList : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        apiTable : {
            'GET'   : {},
            'POST'  : {},
            'PUT'   : {},
            'DELETE': {},
            'OPTIONS': {},
        },
        //记录api的分组，只有在分组内的路径才会去处理，
        //这是为了避免不是通过分组添加但是仍然使用和分组相同前缀的路由也被当作分组内路由处理。
        apiGroupTable : {},
    };

    if (options && options.ignoreSlash !== undefined) {
        rt.ignoreSlash = options.ignoreSlash;
    }

    /*
        由于在路由匹配时会使用/分割路径，所以在添加路由时先处理好。
        允许:表示变量，*表示任何路由，但是二者不能共存，因为无法知道后面的是变量还是路由。
        比如：/static/*可以作为静态文件所在目录，但是后面的就直接作为*表示的路径，
        并不进行参数解析。
    */
    /**
     * @param {string} api_path 路由字符串
     * @param {string} method 请求方法类型
     * @param {function} callback 执行请求的回调函数
     * @param {string} name 请求名称，可以不填写
     */
    rt.addPath = function (api_path, method, callback, name = '') {
        if (typeof callback !== 'function'
            || callback.constructor.name !== 'AsyncFunction'
        ) {
            throw new Error(`${method} ${api_path}: callback must use async statement`);
        }
        if (api_path[0] !== '/') { api_path = `/${api_path}`; }

        if (api_path.length > 1
            && api_path[api_path.length-1] == '/'
            && rt.ignoreSlash
        ) {
            api_path = api_path.substring(0, api_path.length-1);
        }
        var add_req = {
                isArgs:  false,
                isStar:  false,
                routeArr: [],
                reqCall: callback,
                name : name,
                groupName : ''
            };
        if (api_path.indexOf(':') >= 0) {
            add_req.isArgs = true;
        }
        if (api_path.indexOf('*') >= 0) {
            add_req.isStar = true;
        }

        if (add_req.isStar 
            && add_req.isArgs
        ) {
            throw new Error(`Error: ": *" can not in two places at once > ${api_path}`);
        }

        add_req.routeArr = api_path.split('/').filter(p => p.length > 0);
        add_req.groupName = `/${add_req.routeArr[0]}`;

        switch (method) {
            case 'GET':
            case 'POST':
            case 'PUT':
            case 'DELETE':
            case 'OPTIONS':
                if (rt.apiTable[method][api_path]) {
                    throw new Error(`${api_path} conflict`);
                }
                rt.apiTable[method][api_path] = add_req;
                break;
            default:
                return ;
        }
    };

    rt.get = (api_path, callback, name='') => {
        rt.addPath(api_path, 'GET', callback, name);
    };

    rt.post = (api_path, callback, name='') => {
        rt.addPath(api_path, 'POST', callback, name);
    };

    rt.put = (api_path, callback, name='') => {
        rt.addPath(api_path, 'PUT', callback, name);
    };

    rt.delete = (api_path, callback, name='') => {
        rt.addPath(api_path, 'DELETE', callback, name);
    };

    rt.options = (api_path, callback, name = '') => {
        rt.addPath(api_path, 'OPTIONS', callback, name);
    };

    rt.any = (api_path, callback, name='') => {
        rt.map(rt.methodList, api_path, callback, name);
    };

    rt.map = (marr, api_path, callback, name='') => {
        for(var i=0; i<marr.length; i++) {
            rt.addPath(api_path, marr[i], callback, name);
        }
    };

    /**
     * 返回一个分组路由对象，主要便于路由分组操作
     * @param {string} grp 分组名称
     */
    rt.group = function (grp) {
        if (grp == '' || grp[0] !== '/') {
            grp = `/${grp}`;
        }
        if (grp.length > 0 && grp[grp.length-1] == '/' && grp!=='/') {
            grp = grp.substring(0, grp.length-1);
        }

        var gt = {
            groupName : grp
        };

        gt.realPath = function (apath) {
            if (apath == '/' && rt.ignoreSlash) {
                return gt.groupName;
            }
            if (apath[0]!=='/') {
                if (gt.groupName!=='/') {
                    return `${gt.groupName}/${apath}`;
                } else {
                    return `${gt.groupName}${apath}`;
                }
            } else {
                if (gt.groupName!=='/') {
                    return `${gt.groupName}${apath}`;
                } else {
                    return apath;
                }
            }
        };

        gt.add_group_api = (apath) => {
            if (!rt.apiGroupTable[gt.groupName]) {
                rt.apiGroupTable[gt.groupName] = {};
            }
            rt.apiGroupTable[gt.groupName][gt.realPath(apath)] = apath;
        };

        gt.get = function(apath, callback, name='') {
            gt.add_group_api(apath);
            rt.get(gt.realPath(apath), callback, name);
        };

        gt.post = function(apath, callback, name='') {
            gt.add_group_api(apath);
            rt.post(gt.realPath(apath), callback, name);
        };

        gt.delete = function(apath, callback, name='') {
            gt.add_group_api(apath);
            rt.delete(gt.realPath(apath), callback, name);
        };

        gt.options = function(apath, callback, name='') {
            gt.add_group_api(apath);
            rt.options(gt.realPath(apath), callback, name);
        };

        gt.any = function(apath, callback, name='') {
            gt.add_group_api(apath);
            rt.any(gt.realPath(apath), callback, name);
        };

        gt.map = function(marr, apath, callback, name='') {
            gt.add_group_api(apath);
            rt.map(marr, gt.realPath(apath), callback, name);
        };
        
        return gt;
    };

    /**
     * findPath只是用来查找带参数的路由。
     * @param {string} path 路由字符串。
     * @param {string} method 请求类型。
     */
    rt.findPath = function (path, method) {
        if (!rt.apiTable[method]) {
            return null;
        }
        if (path.length > 2042) {
            return null;
        }
        var path_split = path.split('/');
        path_split = path_split.filter(p => p.length > 0);
        if (path_split.length > 9) {
            return null;
        }

        var next = 0;
        var args = {};
        var r = null;
        for (var k in rt.apiTable[method]) {
            r = rt.apiTable[method][k];
            if (r.isArgs === false && r.isStar === false) {
                continue;
            }

            if (
                (r.routeArr.length !== path_split.length && r.isStar === false)
                ||
                (r.isStar && r.routeArr.length > path_split.length+1)
            ) {
                continue;
            }

            next = false;
            args = {};
            if (r.isStar) {
                for(var i=0; i<r.routeArr.length; i++) {
                    if (r.routeArr[i] == '*') {
                        args.starPath = path_split.slice(i).join('/');
                    } else if(r.routeArr[i] !== path_split[i]) {
                        next = true;
                        break;
                    }
                }
            } else {
                for(var i=0; i<r.routeArr.length; i++) {
                    if (r.routeArr[i][0] == ':') {
                        args[r.routeArr[i].substring(1)] = path_split[i];
                    } else if (r.routeArr[i] !== path_split[i]) {
                        next = true;
                        break;
                    }
                }
            }

            if (next) { continue; }

            return {key: k, args: args};
        }
        return null;
    };

    rt.findRealPath = function (path, method) {
        var route_path = null;
        if (path.length > 1
            && path[path.length-1] == '/'
            && rt.ignoreSlash
        ) {
            path = path.substring(0, path.length-1);
        }

        if (rt.apiTable[method][path] !== undefined) {
            route_path = path;
        }

        if (route_path && route_path.indexOf('/:') >= 0) {
            route_path = null;
        }

        var parg = null;
        if (route_path === null) {
            parg = rt.findPath(path, method);
        } else {
            parg = {args : {}, key: route_path};
        }
        if (parg !== null) {
            parg.reqcall = rt.apiTable[method][parg.key];
        };
        return parg;
    };

    /**
     * @param {object} r 通过findRealPath返回的对象
     * @param {object} ctx 请求上文对象
     */
    rt.setContext = function(r, ctx) {
        ctx.routepath = r.key;
        ctx.requestCall = r.reqcall.reqCall;
        ctx.name = r.reqcall.name;
        ctx.group = r.reqcall.groupName;
        ctx.param = r.args;
        if (!rt.apiGroupTable[ctx.group] 
            || !rt.apiGroupTable[ctx.group][ctx.routepath]
        ) {
            ctx.group = '';
        }
    };

    return rt;
}

module.exports = router;
