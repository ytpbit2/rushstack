import { Executable } from '@rushstack/node-core-library';
import { RushConfigurationProject } from '@rushstack/rush-sdk';
import { WatchProject } from './WatchProject';

export class WatchProcess {
  public readonly project: WatchProject;
  public readonly configProject: RushConfigurationProject;

  public constructor(project: WatchProject, configProject: RushConfigurationProject) {
    this.project = project;
    this.configProject = configProject;
  }

  public start(scriptName: string): void {
    const watchScript: string = this.configProject.packageJson.scripts?.[scriptName] ?? '';
    if (!watchScript) {
      throw new Error(
        `The selected project "${this.configProject.packageName}" is missing a "${scriptName}" script`
      );
    }
    console.log(`${this.configProject.packageName}: Starting ${JSON.stringify(watchScript)}`);
  }
}
