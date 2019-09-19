'use strict';

const fs = require('fs');
const mt = require('../main');

var app = new mt({
    //deny: ['127.0.0.1']
    maxIPRequest: 80,
    //showLoadInfo: false,
    peerTime: 1,
    //whiteList: ['127.0.0.1']
    bodyMaxSize: 1000000,
    cert: '../rsa/localhost-cert.pem',
    key: '../rsa/localhost-privkey.pem',
    showLoadInfo: false,
    globalLog:true,
    logType: 'stdio',
});

var {router} = app;

router.get('/', async rr => {
    rr.res.body = 'success';
});

router.get('/name', async rr => {
    rr.res.body = rr.param;
});

router.post('/p', async rr => {
    rr.res.body = rr.body;
});

router.get('/wrong', async rr => {
    throw new Error('error test');
});

router.get('/end', async rr => {
    rr.response.end('end-test');
});

app.add(async (ctx, next) => {
    var start_time = Date.now();
    await next(ctx);
    var end_time = Date.now();
    console.log(ctx.path, end_time - start_time);
});

//测试路由，会抛出错误，只能添加async声明的函数。
//router.get('/router-test', rr => { });

if (process.argv.length >= 3 && process.argv[2] == '-d') {
    app.config.daemon = true;
}

app.daemon(2021);
