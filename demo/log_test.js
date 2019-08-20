const mt = require('../motoboat');

var app = new mt({
    //deny: ['127.0.0.1']
    maxIPRequest: 380,
    //showLoadInfo: false,
    peerTimeLimitIP: 1,
    //whiteList: ['127.0.0.1']
    bodyMaxSize: 100,
    cert: '../rsa/localhost-cert.pem',
    key: '../rsa/localhost-privkey.pem',
    //showLoadInfo: false,
});

/* 
app.config.log_type = 'file';
app.config.log_file = '../tmp/access.log';
app.config.error_log_file = '../tmp/error.log'; */
//app.config.global_log = true;

var {router} = app;

router.get('/', async rr => {
    rr.res.data = 'success';
});

router.get('/name', async rr => {
    rr.res.data = rr.param;
});

router.post('/p', async rr => {
    rr.res.data = rr.bodyparam;
});

router.get('/wrong', async rr => {
    throw new Error('error test');
});

//测试路由，会抛出错误，只能添加async声明的函数。
//router.get('/router-test', rr => { });

if (process.argv.length >= 3 && process.argv[2] == '-d') {
    app.config.daemon = true;
}

app.daemon(2021);
