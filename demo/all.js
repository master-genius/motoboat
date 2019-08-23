'use strict';

var motoboat = require('../motoboat');

var app = new motoboat({
    debug: true,
});

var {router} = app;

router.any('/*', async c => {
    c.res.body = 'ha ha ha, all is me.';
});

app.run(2021);
