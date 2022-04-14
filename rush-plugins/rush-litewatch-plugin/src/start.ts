// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration, RushConfigurationProject } from '@rushstack/rush-sdk';
import { ConsoleTerminalProvider } from '@rushstack/node-core-library';
import { WatchManager } from './WatchManager';
import { WatchProcess } from './WatchProcess';
import { WatchProject } from './WatchProject';

process.exitCode = 1;

console.log('Starting watch mode...');

function getConfigProject(projectName: string, configuration: RushConfiguration): RushConfigurationProject {
  const result: RushConfigurationProject | undefined = configuration.getProjectByName(projectName);
  if (!result) {
    throw new Error(`The project "${projectName}" was not found`);
  }
  return result;
}

async function start(): Promise<void> {
  const terminalProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();
  const configuration: RushConfiguration = RushConfiguration.loadFromDefaultLocation();

  const projectNcl: RushConfigurationProject = getConfigProject(
    '@rushstack/node-core-library',
    configuration
  );
  const watchNcl: WatchProject = new WatchProject(projectNcl.packageName, []);

  const projectRushell: RushConfigurationProject = getConfigProject('@microsoft/rushell', configuration);
  const watchRushell: WatchProject = new WatchProject(projectRushell.packageName, [watchNcl]);

  const manager: WatchManager = new WatchManager(terminalProvider);

  const processNcl: WatchProcess = new WatchProcess(watchNcl, projectNcl);
  const processRushell: WatchProcess = new WatchProcess(watchRushell, projectRushell);

  processNcl.start('watch');

  process.exitCode = 0;
}

start().catch((error) => {
  console.error('ERROR: ' + error.toString());
});
