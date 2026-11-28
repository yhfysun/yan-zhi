#!/usr/bin/env node
process.env.YZ_ANDROID_BUILD_TYPE = 'release';
require('./assemble-debug.cjs');
