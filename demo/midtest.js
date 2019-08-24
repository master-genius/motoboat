'use strict';

const fs = require('fs');
const mt = require('../motoboat');

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
    logType: 'stdio'
});

var {router} = app;

router.get('/', async rr => {
    rr.res.body = 'success';
});

router.get('/name', async rr => {
    rr.res.body = rr.query;
});

var quantum = router.group('quantum');
quantum.get('/what', async c => {
    try {
        c.res.body = await new Promise((rv, rj) => {
            fs.readFile('quantum', {encoding:'utf8'}, (err, data) => {
                if (err) {rj(err);}
                rv(data);
            });
        });
    } catch (err) {
        rr.res.body = err.message;
    }
});

quantum.get('/who', async c => {
    c.res.body = ['阿尔伯特·爱因斯坦','玻尔','薛订谔','海森伯', '狄拉克'];
});

//测试路由，会抛出错误，只能添加async声明的函数。
//router.get('/router-test', rr => { });

app.add(async (ctx, next) => {
    console.log('q1');
    await next(ctx);
    console.log('q1');
});

app.add(async (ctx, next) => {
    console.log('q2');
    await next(ctx);
    console.log('q2');
});

if (process.argv.length >= 3 && process.argv[2] == '-d') {
    app.config.daemon = true;
}

app.daemon(2021);
