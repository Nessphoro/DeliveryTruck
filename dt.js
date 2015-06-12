///<reference path="typings/node/node.d.ts"/>
///<reference path="typings/js-yaml/js-yaml.d.ts"/>
///<reference path="typings/minimist/minimist.d.ts"/>
///<reference path="typings/ssh2.d.ts" />
///<reference path="typings/asyncblock/asyncblock.d.ts" />
///<reference path="typings/async/async.d.ts" />
var minimist = require("minimist");
var fs = require("fs");
var yaml = require('js-yaml');
var executor = require("./executor");
function printGeneralHelp() {
    console.log("Welcome to Delivery Truck deployment tool, here's the run down:\n\nGeneral usage: truck [command] [args]\n\nQuick deploy: truck deploy\n\nCommand listing:\n    truck help - displays this message\n    truck help [command] - show help for some command\n    truck init - create a starter .truck.yml configuration\n    truck deploy - executes quick.truck.yml\n    truck deploy [name] - executes [name].truck.yml\n");
}
function printHelp(command) {
    switch (command) {
        case "init":
            console.log("Help for truck init:\n\nThis command will create a quick deployment script 'quick.truck.yml' that will be executed on truck deploy.\nIf you alredy have an existing quick.truck.yml the command will fail");
            break;
        case "deploy":
            console.log("Help for truck deploy:\n\nThis command will use the config file provided (or quick, if it wasn't) to execute commands on the remote servers.\nYou can also pass in extra arguments:\n    --nostrict: If an error occurs during a deploy the execution will go on to the next server, this overrides\n                the value provided in the config file. Strict Mode is on by defaut.\n    --keyFile: Provide a keyfile for authentication with the remote hosts, overrides the value in the config file.\n               You can also set this using an environment variable TRUCK_KEYFILE. Default is ~/.ssh/id_rsa.\n    --passphrase: If you are using a passphrase for your keyFile set it here. Can be set using environment variable\n                  TRUCK_PASSPHRASE.\n");
    }
}
function createConfigFile(file) {
    if (fs.existsSync(file)) {
        console.error("FAILED: " + file + " already exists");
        process.exit(1);
    }
    else {
        var simpleConfig = "\nservers:\n  - ssh://deploy@main.example.com\n  - ssh://anotherdeploy@notmain.example.com:398\nprepare:\n  - meteor bundle bundle.tar.bz2\nfiles:\n  - bundle.tar.bz2\n  - settings.json\ndeploy_env:\n  - PORT: 4000\n  - MONGO_URL: mongodb://localhost:27017/test\n  - ROOT_URL: http://example.com/\n  - METEOR_SETTINGS: \"@settings.json\"\ndeploy:\n  - tar -zxf bundle.tar.bz2\n  - cd bundle\n  - cd programs/server\n  - npm install\n  - cd ../..\n  - forever restart main.js";
        fs.writeFileSync(file, simpleConfig);
        return;
    }
}
var argv = minimist(process.argv.slice(2));
if (argv._.indexOf("help") == 0) {
    //Show help;
    if (argv._.length == 1) {
        printGeneralHelp();
    }
    else {
        var command = argv._[1];
        printHelp(command);
    }
}
else if (argv._.length == 0) {
    printGeneralHelp();
}
else if (argv._.indexOf("init") == 0) {
    var configFile = argv._[1] || "quick";
    configFile = configFile + ".truck.yml";
    createConfigFile(configFile);
}
else if (argv._.indexOf("deploy") == 0) {
    var configFile = argv._[1] || "quick";
    configFile = configFile + ".truck.yml";
    if (!fs.existsSync(configFile)) {
        console.error("FAILED: no config file " + configFile);
        process.exit(1);
    }
    var config = yaml.safeLoad(fs.readFileSync(configFile, "utf8"));
    var options = {};
    options.keyFile = process.env["TRUCK_KEYFILE"] || argv.keyFile || config.keyFile || process.env.HOME + "/.ssh/id_rsa";
    options.passphrase = process.env["TRUCK_PASSPHRASE"] || argv.passphrase || null;
    if (argv.nostrict || config.strict === false) {
        options.strict = false;
    }
    else {
        options.strict = true;
    }
    executor.executeConfiguration(config, options);
}
