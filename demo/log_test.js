const mt = require('../motoboat');

var app = new mt();

app.config.log_type = 'file';
app.config.log_file = '../tmp/access.log';
app.config.error_log_file = '../tmp/error.log';
app.config.global_log = true;

var {router} = app;

var worker_log = async (rr, next) => {
    var log_data = {
        method : rr.method,
        link    : rr.url.origin,
        time   : (new Date()).toLocaleString("zh-Hans-CN"),
        status : 200
    };
    await next(rr);
    log_data.status = rr.res.statusCode;
    if (process.send && typeof process.send === 'function') {
        process.send(log_data);
    }
};

//app.add(worker_log);

router.get('/', async rr => {
    rr.res.data = 'success';
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
