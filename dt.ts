///<reference path="typings/node/node.d.ts"/>
///<reference path="typings/js-yaml/js-yaml.d.ts"/>
///<reference path="typings/minimist/minimist.d.ts"/>
///<reference path="typings/ssh2.d.ts" />
///<reference path="typings/asyncblock/asyncblock.d.ts" />
///<reference path="typings/async/async.d.ts" />

import minimist = require("minimist");
import fs = require("fs");
import yaml = require('js-yaml');
import executor = require("./executor");

function printGeneralHelp()
{
    console.log(`Welcome to Delivery Truck deployment tool, here's the run down:

General usage: truck [command] [args]

Quick deploy: truck deploy

Command listing:
    truck help - displays this message
    truck help [command] - show help for some command
    truck init - create a starter .truck.yml configuration
    truck deploy - executes quick.truck.yml
    truck deploy [name] - executes [name].truck.yml
`);
}

function printHelp(command: string)
{
    switch (command)
    {
        case "init":
            console.log(`Help for truck init:

This command will create a quick deployment script 'quick.truck.yml' that will be executed on truck deploy.
If you alredy have an existing quick.truck.yml the command will fail`);
            break;
        case "deploy":
            console.log(`Help for truck deploy:

This command will use the config file provided (or quick, if it wasn't) to execute commands on the remote servers.
You can also pass in extra arguments:
    --nostrict: If an error occurs during a deploy the execution will go on to the next server, this overrides
                the value provided in the config file. Strict Mode is on by defaut.
    --keyFile: Provide a keyfile for authentication with the remote hosts, overrides the value in the config file.
               You can also set this using an environment variable TRUCK_KEYFILE. Default is ~/.ssh/id_rsa.
    --passphrase: If you are using a passphrase for your keyFile set it here. Can be set using environment variable
                  TRUCK_PASSPHRASE.
`)
    }
}

function createConfigFile(file: string)
{
    if(fs.existsSync(file))
    {
        console.error(`FAILED: ${file} already exists`);
        process.exit(1);
    }
    else
    {
        var simpleConfig = `
servers:
  - ssh://deploy@main.example.com
  - ssh://anotherdeploy@notmain.example.com:398
prepare:
  - meteor bundle bundle.tar.bz2
files:
  - bundle.tar.bz2
  - settings.json
deploy_env:
  - PORT: 4000
  - MONGO_URL: mongodb://localhost:27017/test
  - ROOT_URL: http://example.com/
  - METEOR_SETTINGS: "@settings.json"
deploy:
  - tar -zxf bundle.tar.bz2
  - cd bundle
  - cd programs/server
  - npm install
  - cd ../..
  - forever restart main.js`
        fs.writeFileSync(file, simpleConfig);
        return;
    }

}


var argv = minimist(process.argv.slice(2));
if(argv._.indexOf("help") == 0)
{
    //Show help;
    if(argv._.length==1) {
        printGeneralHelp();
    }
    else
    {
        var command = argv._[1];
        printHelp(command);
    }

}
else if(argv._.length==0)
{
    printGeneralHelp();
}
else if(argv._.indexOf("init") == 0)
{
    var configFile = argv._[1] || "quick";
    configFile = configFile + ".truck.yml";
    createConfigFile(configFile);
}
else if(argv._.indexOf("deploy") == 0)
{
    var configFile = argv._[1] || "quick";
    configFile = configFile + ".truck.yml";
    if (!fs.existsSync(configFile)) {
        console.error(`FAILED: no config file ${configFile}`);
        process.exit(1);
    }
    var config = yaml.safeLoad(fs.readFileSync(configFile, "utf8"));

    var options:any = {};
    options.keyFile = process.env["TRUCK_KEYFILE"]|| argv.keyFile || config.keyFile|| process.env.HOME+"/.ssh/id_rsa";
    options.passphrase = process.env["TRUCK_PASSPHRASE"]||argv.passphrase|| null;
    if(argv.nostrict || config.strict===false)
    {
        options.strict = false;
    }
    else
    {
        options.strict = true;
    }
    executor.executeConfiguration(config, options);

}