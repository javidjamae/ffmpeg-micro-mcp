#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const server = JSON.parse(readFileSync('server.json', 'utf8'));

server.version = version;
for (const pkg of server.packages ?? []) pkg.version = version;

writeFileSync('server.json', JSON.stringify(server, null, 2) + '\n');
console.log(`server.json synced to ${version}`);
