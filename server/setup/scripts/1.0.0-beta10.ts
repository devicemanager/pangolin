import { configFilePath1, configFilePath2 } from "@server/lib/consts";
import fs from "fs";
import yaml from "js-yaml";

export default async function migration() {
    console.log("Running setup script 1.0.0-beta.9...");

    try {
        // Determine which config file exists
        const filePaths = [configFilePath1, configFilePath2];
        let filePath = "";
        for (const path of filePaths) {
            if (fs.existsSync(path)) {
                filePath = path;
                break;
            }
        }

        if (!filePath) {
            throw new Error(
                `No config file found (expected config.yml or config.yaml).`
            );
        }

        // Read and parse the YAML file
        let rawConfig: any;
        const fileContents = fs.readFileSync(filePath, "utf8");
        rawConfig = yaml.load(fileContents);

        delete rawConfig.server.secure_cookies;

        // Write the updated YAML back to the file
        const updatedYaml = yaml.dump(rawConfig);
        fs.writeFileSync(filePath, updatedYaml, "utf8");

        console.log(`Removed deprecated config option: secure_cookies.`);
    } catch (e) {
        console.log(
            `Was unable to remove deprecated config option: secure_cookies. Error: ${e}`
        );
        return;
    }

    console.log("Done.");
}
