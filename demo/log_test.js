const mt = require('../motoboat');

var app = new mt();

app.config.on_finish = (headers, resheaders, reqinfo) => {
    console.log(headers);
    console.log(resheaders);
    console.log(reqinfo);
    return ;
    var log_data = {
        type    : 'success',
        method  : headers['method'],
        link    : '',
        time    : reqinfo.time,
        status  : resheaders[':status'],
        ip      : reqinfo.ip
    };

    log_data.link = `${headers}`;

    if (log_data.status != 200) {
        log_data.type = 'error';
    }
    if (process.send && typeof process.send === 'function') {
        process.send(log_data);
    }
};

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

app.daemon(2021);
