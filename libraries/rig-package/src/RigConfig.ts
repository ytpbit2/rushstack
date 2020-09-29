// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import * as nodeResolve from 'resolve';
import * as stripJsonComments from 'strip-json-comments';

/**
 * Represents the literal contents of the `config/rig.json` file.
 *
 * @public
 */
export interface IRigConfigJson {
  /**
   * The name of the rig package to use.
   *
   * @remarks
   * The name must be a valid NPM package name, and must end with the `-rig` suffix.
   *
   * Example: `example-rig`
   */
  rigPackageName: string;

  /**
   * Specify which rig profile to use from the rig package.
   *
   * @remarks
   * The name must consist of lowercase alphanumeric words separated by hyphens, for example `"sample-profile"`.
   * If the `"rigProfile"` is not specified, then the profile name `"default"` will be used.
   *
   * Example: `example-profile`
   */
  rigProfile?: string;
}

interface IRigConfigOptions {
  projectFolderPath: string;

  rigFound: boolean;
  filePath: string;
  rigPackageName: string;
  rigProfile: string;
}

/**
 * Options for {@link RigConfig.loadForProjectFolder}.
 *
 * @public
 */
export interface ILoadForProjectFolderOptions {
  /**
   * The path to the folder of the project to be analyzed.  This folder should contain a `package.json` file.
   */
  projectFolderPath: string;

  /**
   * If specified, instead of loading the `config/rig.json` from disk, this object will be substituted instead.
   */
  overrideRigJsonObject?: IRigConfigJson;
}

/**
 * This is the main API for loading the `config/rig.json` file format.
 *
 * @public
 */
export class RigConfig {
  // For syntax details, see PackageNameParser from @rushstack/node-core-library
  private static readonly _packageNameRegExp: RegExp = /^(@[A-Za-z0-9\-_\.]+\/)?[A-Za-z0-9\-_\.]+$/;

  // Rig package names must have the "-rig" suffix.
  // Also silently accept "-rig-test" for our build test projects.
  private static readonly _rigNameRegExp: RegExp = /-rig(-test)?$/;

  // Profiles must be lowercase alphanumeric words separated by hyphens
  private static readonly _profileNameRegExp: RegExp = /^[a-z0-9_\.]+(\-[a-z0-9_\.]+)*$/;

  /**
   * Returns the absolute path of the `rig.schema.json` JSON schema file for `config/rig.json`,
   * which is bundled with this NPM package.
   *
   * @remarks
   * The `RigConfig` class already performs schema validation when loading `rig.json`; however
   * this schema file may be useful for integration with other validation tools.
   *
   * @public
   */
  public static jsonSchemaPath: string = path.resolve(__dirname, './schemas/rig.schema.json');
  private static _jsonSchemaObject: object | undefined = undefined;

  /**
   * The project folder path that was passed to {@link RigConfig.loadForProjectFolder}.
   *
   * @remarks
   * Example: `/path/to/your-project`
   */
  public readonly projectFolderPath: string;

  /**
   * Returns `true` if `config/rig.json` was found, or `false` otherwise.
   */
  public readonly rigFound: boolean;

  /**
   * The full path to the `rig.json` file that was found, or `""` if none was found.
   *
   * @remarks
   * Example: `/path/to/your-project/config/rig.json`
   */
  public readonly filePath: string;

  /**
   * The `"rigPackageName"` field from `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * The name must be a valid NPM package name, and must end with the `-rig` suffix.
   *
   * Example: `example-rig`
   */
  public readonly rigPackageName: string;

  /**
   * The `"rigProfile"` value that was loaded from `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * The name must consist of lowercase alphanumeric words separated by hyphens, for example `"sample-profile"`.
   * If the `rig.json` file exists, but the `"rigProfile"` is not specified, then the profile
   * name will be `"default"`.
   *
   * Example: `example-profile`
   */
  public readonly rigProfile: string;

  /**
   * The relative path to the rig profile specified by `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * Example: `profiles/example-profile`
   */
  public readonly relativeProfileFolderPath: string;

  // Example: /path/to/your-project/node_modules/example-rig/
  // If the value is `undefined`, then getResolvedProfileFolder() has not calculated it yet
  private _resolvedRigPackageFolder: string | undefined;

  // Example: /path/to/your-project/node_modules/example-rig/profiles/example-profile
  // If the value is `undefined`, then getResolvedProfileFolder() has not calculated it yet
  private _resolvedProfileFolder: string | undefined;

  private constructor(options: IRigConfigOptions) {
    this.projectFolderPath = options.projectFolderPath;

    this.rigFound = options.rigFound;
    this.filePath = options.filePath;
    this.rigPackageName = options.rigPackageName;
    this.rigProfile = options.rigProfile;

    if (this.rigFound) {
      this.relativeProfileFolderPath = 'profiles/' + this.rigProfile;
    } else {
      this.relativeProfileFolderPath = '';
    }
  }

  /**
   * The JSON contents of the {@link RigConfig.jsonSchemaPath} file.
   *
   * @remarks
   * The JSON object will be lazily loaded when this property getter is accessed, and the result
   * will be cached.
   * Accessing this property may make a synchronous filesystem call.
   */
  public static get jsonSchemaObject(): object {
    if (RigConfig._jsonSchemaObject === undefined) {
      const jsonSchemaContent: string = fs.readFileSync(RigConfig.jsonSchemaPath).toString();
      RigConfig._jsonSchemaObject = JSON.parse(jsonSchemaContent);
    }
    return RigConfig._jsonSchemaObject!;
  }

  /**
   * Use this method to load the `config/rig.json` file for a given project.
   *
   * @remarks
   * If the file cannot be found, an empty `RigConfig` object will be returned with {@link RigConfig.rigFound}
   * equal to `false`.
   */
  public static loadForProjectFolder(options: ILoadForProjectFolderOptions): RigConfig {
    const rigConfigFilePath: string = path.join(options.projectFolderPath, 'config/rig.json');

    let json: IRigConfigJson;
    try {
      if (options.overrideRigJsonObject) {
        json = options.overrideRigJsonObject;
      } else {
        if (!fs.existsSync(rigConfigFilePath)) {
          return new RigConfig({
            projectFolderPath: options.projectFolderPath,

            rigFound: false,
            filePath: '',
            rigPackageName: '',
            rigProfile: ''
          });
        }

        const rigConfigFileContent: string = fs.readFileSync(rigConfigFilePath).toString();
        json = JSON.parse(stripJsonComments(rigConfigFileContent));
      }
      RigConfig._validateSchema(json);
    } catch (error) {
      throw new Error(error.message + '\nError loading config file: ' + rigConfigFilePath);
    }

    return new RigConfig({
      projectFolderPath: options.projectFolderPath,

      rigFound: true,
      filePath: rigConfigFilePath,
      rigPackageName: json.rigPackageName,
      rigProfile: json.rigProfile || 'default'
    });
  }

  /**
   * An async variant of {@link RigConfig.loadForProjectFolder}
   */
  public static async loadForProjectFolderAsync(options: ILoadForProjectFolderOptions): Promise<RigConfig> {
    const rigConfigFilePath: string = path.join(options.projectFolderPath, 'config/rig.json');

    let json: IRigConfigJson;
    try {
      if (options.overrideRigJsonObject) {
        json = options.overrideRigJsonObject;
      } else {
        if (!(await RigConfig._fsExistsAsync(rigConfigFilePath))) {
          return new RigConfig({
            projectFolderPath: options.projectFolderPath,

            rigFound: false,
            filePath: '',
            rigPackageName: '',
            rigProfile: ''
          });
        }

        const rigConfigFileContent: string = (await fs.promises.readFile(rigConfigFilePath)).toString();
        json = JSON.parse(stripJsonComments(rigConfigFileContent));
      }

      RigConfig._validateSchema(json);
    } catch (error) {
      throw new Error(error.message + '\nError loading config file: ' + rigConfigFilePath);
    }

    return new RigConfig({
      projectFolderPath: options.projectFolderPath,

      rigFound: true,
      filePath: rigConfigFilePath,
      rigPackageName: json.rigPackageName,
      rigProfile: json.rigProfile || 'default'
    });
  }

  /**
   * Performs Node.js module resolution to locate the rig package folder, then returns the absolute path
   * of the rig profile folder specified by `rig.json`.
   *
   * @remarks
   * If no `rig.json` file was found, then this method throws an error.  The first time this method
   * is called, the result is cached and will be returned by all subsequent calls.
   *
   * Example: `/path/to/your-project/node_modules/example-rig/profiles/example-profile`
   */
  public getResolvedProfileFolder(): string {
    if (this._resolvedRigPackageFolder === undefined) {
      if (!this.rigFound) {
        throw new Error('Cannot resolve the rig package because no rig was specified for this project');
      }

      const rigPackageJsonModuleSpecifier: string = `${this.rigPackageName}/package.json`;
      const resolveOptions: nodeResolve.Opts = { basedir: this.projectFolderPath };
      const resolvedRigPackageJsonPath: string = nodeResolve.sync(
        rigPackageJsonModuleSpecifier,
        resolveOptions
      );

      this._resolvedRigPackageFolder = path.dirname(resolvedRigPackageJsonPath);
    }

    if (this._resolvedProfileFolder === undefined) {
      this._resolvedProfileFolder = path.join(this._resolvedRigPackageFolder, this.relativeProfileFolderPath);

      if (!fs.existsSync(this._resolvedProfileFolder)) {
        throw new Error(
          `The rig profile "${this.rigProfile}" is not defined` +
            ` by the rig package "${this.rigPackageName}"`
        );
      }
    }

    return this._resolvedProfileFolder;
  }

  /**
   * An async variant of {@link RigConfig.getResolvedProfileFolder}
   */
  public async getResolvedProfileFolderAsync(): Promise<string> {
    if (this._resolvedRigPackageFolder === undefined) {
      if (!this.rigFound) {
        throw new Error('Cannot resolve the rig package because no rig was specified for this project');
      }

      const rigPackageJsonModuleSpecifier: string = `${this.rigPackageName}/package.json`;
      const resolveOptions: nodeResolve.Opts = { basedir: this.projectFolderPath };
      const resolvedRigPackageJsonPath: string = await RigConfig._nodeResolveAsync(
        rigPackageJsonModuleSpecifier,
        resolveOptions
      );

      this._resolvedRigPackageFolder = path.dirname(resolvedRigPackageJsonPath);
    }

    if (this._resolvedProfileFolder === undefined) {
      this._resolvedProfileFolder = path.join(this._resolvedRigPackageFolder, this.relativeProfileFolderPath);

      if (!(await RigConfig._fsExistsAsync(this._resolvedProfileFolder))) {
        throw new Error(
          `The rig profile "${this.rigProfile}" is not defined` +
            ` by the rig package "${this.rigPackageName}"`
        );
      }
    }

    return this._resolvedProfileFolder;
  }

  private static _nodeResolveAsync(id: string, opts: nodeResolve.AsyncOpts): Promise<string> {
    return new Promise((resolve: (result: string) => void, reject: (error: Error) => void) => {
      nodeResolve(id, opts, (error: Error, result: string) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  private static _fsExistsAsync(path: fs.PathLike): Promise<boolean> {
    return new Promise((resolve: (result: boolean) => void) => {
      fs.exists(path, (exists: boolean) => {
        resolve(exists);
      });
    });
  }

  private static _validateSchema(json: IRigConfigJson): void {
    for (const key of Object.getOwnPropertyNames(json)) {
      switch (key) {
        case '$schema':
        case 'rigPackageName':
        case 'rigProfile':
          break;
        default:
          throw new Error(`Unsupported field ${JSON.stringify(key)}`);
      }
    }
    if (!json.rigPackageName) {
      throw new Error('Missing required field "rigPackageName"');
    }

    if (!RigConfig._packageNameRegExp.test(json.rigPackageName)) {
      throw new Error(
        `The "rigPackageName" value is not a valid NPM package name: ${JSON.stringify(json.rigPackageName)}`
      );
    }

    if (!RigConfig._rigNameRegExp.test(json.rigPackageName)) {
      throw new Error(
        `The "rigPackageName" value is missing the "-rig" suffix: ` + JSON.stringify(json.rigProfile)
      );
    }

    if (json.rigProfile !== undefined) {
      if (!RigConfig._profileNameRegExp.test(json.rigProfile)) {
        throw new Error(
          `The profile name must consist of lowercase alphanumeric words separated by hyphens: ` +
            JSON.stringify(json.rigProfile)
        );
      }
    }
  }
}