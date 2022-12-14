// generate.ts
// eslint-disable no-console
//import "../../src/client/init";

import * as fs from "fs";
import { promisify } from "util";
import { glob as globF } from "glob";
import * as jsyaml from "js-yaml";
import * as util from "util";
import { readdir } from "node:fs/promises";
import { resolve } from "path";

type StringMap<V> = { [key: string]: V };

const writeFile = promisify(fs.writeFile);

export async function createEnglishTranslations(
    sourcePath: string,
    destJSONPath: string,
    destRESJSONPath: string
) {
    await loadDevTranslations(sourcePath, destJSONPath, destRESJSONPath);
}

async function* getFiles(dir: any): any {
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
        const res = resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            yield* getFiles(res);
        } else {
            //console.log(res);
            yield res;
        }
    }
}

//load-dev-translations.ts
export async function loadDevTranslations(
    sourcePath: string,
    destJSONPath: string,
    destRESJSONPath: string
): Promise<any> {
    for await (const f of getFiles(sourcePath)) {
        if (f.toString().endsWith(".i18n.yml")) {
            //console.log(f);
            //console.log(fs.readFileSync(f, { encoding: "utf8" }));

            const loader = new DevTranslationsLoader();
            let hasDuplicate = false;

            const translations = await loader.load(f, (key, file) => {
                console.warn(`${key} is being duplicated. "${file}"`);
                hasDuplicate = true;
            });

            if (hasDuplicate) {
                process.exit(1);
            }

            const jsonObject = Array.from(translations).reduce(
                (obj: Record<string, string>, [key, value]) => {
                    obj[key] = value;
                    return obj;
                },
                {}
            );

            const content = JSON.stringify(jsonObject, null, 2);

            const reduced = f.toString().split("\\").pop().split(".");

            const newJSONName = reduced[0] + ".json";
            const newRESJSONName = reduced[0] + ".resjson";

            await writeFile(destJSONPath + "/" + newJSONName, content);

            console.log(
                `Saved combined english translations (${translations.size}) to JSON file ${newJSONName}`
            );

            await writeFile(destRESJSONPath + "/" + newRESJSONName, content);

            console.log(
                `Saved combined english translations (${translations.size}) to RESJSON file ${newRESJSONName}`
            );
        }
    }

    //return "fg";
}

//dev-translations-loader.ts

const glob = util.promisify(globF);
const readFile = util.promisify(fs.readFile);

type DuplicateCallback = (key: string, source: string) => void;

export class DevTranslationsLoader {
    public translationFiles!: string[];
    public translations = new Map<string, string>();

    public async load(
        sourcePath: string,
        duplicateCallback: DuplicateCallback
    ): Promise<Map<string, string>> {
        this.translations.clear();
        if (!this.translationFiles) {
            this.translationFiles = await glob("**/*.i18n.yml", {
                ignore: "node_modules/**/*",
            });
        }
        await this._processFiles(this.translationFiles, duplicateCallback);
        return this.translations;
    }

    private async _processFiles(
        files: string[],
        duplicateCallback: DuplicateCallback
    ) {
        return Promise.all(
            files.map((x) => this._readTranslationFile(x, duplicateCallback))
        );
    }

    private async _readTranslationFile(
        path: string,
        duplicateCallback: DuplicateCallback
    ) {
        const content = await readFile(path);
        this._mergeTranslations(
            this._flatten(jsyaml.load(content.toString())),
            path,
            duplicateCallback
        );
    }

    private _flatten(translations: unknown): StringMap<string> {
        const output: StringMap<any> = {};

        function step(
            object: any,
            prev: string | null = null,
            currentDepth: number = 0
        ) {
            currentDepth = currentDepth || 1;
            for (const key of Object.keys(object)) {
                const value = object[key];
                const isString = typeof value === "string";

                const newKey = prev ? prev + "." + key : key;

                if (!isString && Object.keys(value).length) {
                    output[newKey] = step(value, newKey, currentDepth + 1);
                } else {
                    output[newKey] = value;
                }
            }
        }

        step(translations);

        return output;
    }

    private _mergeTranslations(
        translations: StringMap<any>,
        source: string,
        duplicateCallback: DuplicateCallback
    ) {
        if (process.env.NODE_ENV !== "production") {
            for (const key of Object.keys(translations)) {
                if (this.translations.has(key)) {
                    duplicateCallback(key, source);
                }
            }
        }

        for (const key of Object.keys(translations)) {
            this.translations.set(key, translations[key]);
        }
    }
}
