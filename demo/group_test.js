'use strict';

const awix = require('../motoboat.js');

var ant = new awix({
    showLoadInfo: false,
    cors: '*',
    optionsReturn: true,
});

var {router} = ant;

var api = router.group('/api');

api.get('/a', async rr => {
    rr.res.body = {
        a : 1, b: 2
    };
});

api.get('/xyz', async rr => {
    console.log(rr.group);
    rr.res.body = 'xyz';
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
    rr.res.body = 'success';
});

router.options('/*', async rr => {
    console.log('options');
});

ant.add(async (rr, next) => {
    console.log('route match : ' + rr.routepath);
    await next(rr);
}, {preg : /xy/i, group: api.groupName});

api.get('a/:c/x', async rr => {
    rr.res.body = rr.param;
});

router.get('x/y/', async rr => {
    rr.res.body = `${rr.path}\n${rr.routepath}`;
});

router.get('/', async rr => {
    var api_list = {
        'GET' : Object.keys(router.apiTable['GET']),
        'POST' : Object.keys(router.apiTable['POST'])
    };
    rr.res.body = api_list;
});

var great = router.group('great');

great.get('/', async c => {
    c.res.body = 'great';
});

great.get('/:name', async c => {
    c.res.body = c.param;
}, 'name');

ant.add(async (ctx, next) => {
    console.log('test for group');
    await next(ctx);
});

ant.add(async (ctx, next) => {
    console.log('test for great');
    await next(ctx);
}, great.groupName);

great.head('/', async c => {
    c.res.setHeader('content-type', 'text/plain');
    c.res.body = 'head head';
});

console.log(ant.router);
console.log(ant.middleware);

//支持IPv6地址
ant.run(8098, '::');
