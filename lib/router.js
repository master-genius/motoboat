/**
    module router
    Copyright (C) 2019.08 BraveWang
    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 3 of the License , or
    (at your option) any later version.
 */

/* 
 * 此路由模块的设计采用了分离式分组设计，这个名称起得感觉还不错，其实就是分组和路由彻底分开，
 * 其本质就是根本不分组，在路由内部只是在路由标记记录的对象上记录了其分组名称，
 * 这样实现方便，而且使用也方便，并且分组不受路由限制，可以是/分割的首个字符串也可以是其他任何名字。
 * 
 * 你可以在一个单独的表中记录路由和分组，然后让一个函数进行动态加载。
 * 而这样的设计，就可以方便和中间件机制结合，中间件模块可以更好的对中间件按照路由分组进行处理。
 */

'use strict';

class router {

    constructor (options = {}) {
        this.ignoreSlash = true;

        this.apiTable = {
            'GET'   : {},
            'POST'  : {},
            'PUT'   : {},
            'DELETE': {},
            'OPTIONS': {},
            'HEAD'  : {},
            'PATCH' : {},
            'TRACE' : {}
        };

        this.methods = Object.keys(this.apiTable);

        //记录api的分组，只有在分组内的路径才会去处理，
        //这是为了避免不是通过分组添加但是仍然使用和分组相同前缀的路由也被当作分组内路由处理。
        this.apiGroup = {};

        this.nameTable = {};

        if (options.ignoreSlash !== undefined) {
            this.ignoreSlash = options.ignoreSlash;
        }
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
     * @param {string|bool} group 路由归为哪一组，可以是字符串，
     *                          或者是bool值true表示使用/分割的第一个字符串。
     */
    addPath (api_path, method, callback, name = '') {
        if (typeof callback !== 'function'
            || callback.constructor.name !== 'AsyncFunction'
        ) {
            throw new Error(`${method} ${api_path}: callback must use async statement（回调函数必须使用async声明）`);
        }
        
        if (api_path[0] !== '/') { api_path = `/${api_path}`; }

        if (api_path.length > 1
            && api_path[api_path.length-1] == '/'
            && this.ignoreSlash
        ) {
            api_path = api_path.substring(0, api_path.length-1);
        }

        var group = '';
        if (typeof name === 'object') {
            if (name.group !==undefined) {
                group = name.group;
            }
            if (name.name !== undefined) {
                name = name.name;
            } else {
                name = '';
            }
        } else if (typeof name === 'string') {
            if (name.length > 1 && name[0] == '@') {
                group = name.substring(1);
                name = '';
            }
        } else {
            name = '';
        }

        var add_req = {
                isArgs:  false,
                isStar:  false,
                routeArr: [],
                reqCall: callback,
                name : name,
                group : ''
            };
        if (api_path.indexOf(':') >= 0) {
            add_req.isArgs = true;
        }
        if (api_path.indexOf('*') >= 0) {
            add_req.isStar = true;
        }

        if (add_req.isStar && add_req.isArgs) {
            throw `Error: ": *" can not in two places at once > ${api_path} （参数:和*不能同时出现）`;
        }

        if (name !== '' && this.nameTable[name]) {
            throw `Error: ${name} alreay here, please rename（路由命名${name} 已经存在。）`;
        }

        add_req.routeArr = api_path.split('/').filter(p => p.length > 0);
        if(typeof group === 'string' && group.length > 0) {
            add_req.group = group;
        }

        if (add_req.group !== '') {
            if (this.apiGroup[add_req.group] === undefined) {
                this.apiGroup[add_req.group] = [];
            }
            this.apiGroup[add_req.group].push({
                method: method,
                path: api_path
            });
        }

        if (this.methods.indexOf(method) >= 0) {
            if (this.apiTable[method][api_path]) {
                throw new Error(`${api_path} conflict (${api_path}冲突，多次添加)`);
            }
            this.apiTable[method][api_path] = add_req;
            if (name.length > 0) {
                this.nameTable[name] = api_path;
            }
        }
    }

    get (api_path, callback, name='') {
        this.addPath(api_path, 'GET', callback, name);
    }

    post (api_path, callback, name='') {
        this.addPath(api_path, 'POST', callback, name);
    }

    put (api_path, callback, name='') {
        this.addPath(api_path, 'PUT', callback, name);
    }

    delete (api_path, callback, name='') {
        this.addPath(api_path, 'DELETE', callback, name);
    }

    options (api_path, callback, name = '') {
        this.addPath(api_path, 'OPTIONS', callback, name);
    }

    patch (api_path, callback, name = '') {
        this.addPath(api_path, 'PATCH', callback, name);
    }

    head (api_path, callback, name = '') {
        this.addPath(api_path, 'HEAD', callback, name);
    }

    trace (api_path, callback, name = '') {
        this.addPath(api_path, 'TRACE', callback, name);
    }

    map (marr, api_path, callback, name='') {
        for(var i=0; i<marr.length; i++) {
            this.addPath(api_path, marr[i], callback, name);
        }
    }

    any (api_path, callback, name='') {
        this.map(this.methodList, api_path, callback, name);
    }

    group () {
        return this.apiGroup;
    }

    routeTable () {
        return this.apiTable;
    }

    hasPath (path) {
        return this.apiTable[path] === undefined ? false : true;
    }

    /**
     * 清理路由表等
     */
    clear() {
        for(let k in this.apiTable) {
            this.apiTable[k] = {};
        }
        this.apiGroup = {};
        this.nameTable = {};
    }

    /**
     * findPath只是用来查找带参数的路由。
     * @param {string} path 路由字符串。
     * @param {string} method 请求类型。
     */
    findPath (path, method) {
        if (!this.apiTable[method]) {
            return null;
        }
        /* if (path.length > 2042) {
            return null;
        } */
        var path_split = path.split('/');
        path_split = path_split.filter(p => p.length > 0);
        if (path_split.length > 9) {
            return null;
        }

        var next = 0;
        var args = {};
        var r = null;
        for (var k in this.apiTable[method]) {
            r = this.apiTable[method][k];
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

    /**
     * 
     * @param {string} path 
     * @param {string} method 
     */
    findRealPath (path, method) {
        if (path.length > 2000) {
            return null;
        }
        var route_path = null;
        if (path.length > 1
            && path[path.length-1] == '/'
            && this.ignoreSlash
        ) {
            path = path.substring(0, path.length-1);
        }

        if (this.apiTable[method][path] !== undefined) {
            route_path = path;
        }

        if (route_path && route_path.indexOf('/:') >= 0) {
            route_path = null;
        }
        
        var parg = null;
        if (route_path === null) {
            parg = this.findPath(path, method);
        } else {
            parg = {args : {}, key: route_path};
        }
        if (parg !== null) {
            parg.reqcall = this.apiTable[method][parg.key];
        };
        return parg;
    };

    /**
     * @param {function} next 下层中间件
     * @param {object} ctx 请求上文对象
     */
    setContext (ctx) {
        ctx.routepath = ctx.routerObj.key;
        ctx.requestCall = ctx.routerObj.reqcall.reqCall;
        ctx.name = ctx.routerObj.reqcall.name;
        ctx.group = ctx.routerObj.reqcall.group;
        ctx.param = ctx.routerObj.args;
        ctx.routerObj = null;
    }

}

module.exports = router;
