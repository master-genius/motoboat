'use strict';

const awix = require('../motoboat.js');

var ant = new awix();

ant.config.body_max_size = 600000000;
//ant.config.log_type = 'stdio';
ant.config.auto_options = true;
ant.config.cors = '*';
//ant.config.show_load_info = true;

var {router, group} = ant;

var api = group('/api');

api.get('/a', async rr => {
    rr.res.data = {
        a : 1, b: 2
    };
});

api.get('/xyz', async rr => {
    console.log(rr.group);
    rr.res.data = 'xyz';
});


ant.add(async (rr, next) => {
    console.log('api say : helo');
    await next(rr);
}, api.groupName);

ant.add(async (rr, next) => {
    console.log('global: hey');
    await next(rr);
});

router.get('/api/we', async rr => {
    console.log(rr.group, 'nothing to say');
    rr.res.data = 'success';
});

router.options('/*', async rr => {
    console.log('options');
});

ant.add(async (rr, next) => {
    console.log('route match : ' + rr.routepath);
    await next(rr);
}, {preg : /xy/i, group: api.groupName});

api.get('a/:c/x', async rr => {
    rr.res.data = rr.args;
});

router.get('x/y/', async rr => {
    rr.res.data = `${rr.path}\n${rr.routepath}`;
});

//支持IPv6地址
ant.run(8098, '::');
