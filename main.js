/**
 * motoboat main
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

const motoboat = require('./lib/motoboat');

module.exports = motoboat;

/**
 * 一些你可能想要知道的：
 * 跨域资源共享标准新增了一组HTTP首部字段，允许服务器声明哪些源站通过浏览器有权限访问哪些资源。
 * 并且规范要求，对那些可能会对服务器资源产生改变的请求方法，
 * 需要先发送OPTIONS请求获取是否允许跨域以及允许的方法。
 * 这可以通过中间件快速解决。
*/
