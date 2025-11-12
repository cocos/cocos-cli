import { SecondFile } from './SecondFile.ts';
import { ThirdFile } from './ThirdFile';

export class FirstFile {
    private secondFile: SecondFile;
    private thirdFile: ThirdFile;

    constructor() {
        this.secondFile = new SecondFile();
        this.thirdFile = new ThirdFile();
    }
}