import { SecondFile } from './SecondFile';
import { ThirdFile } from './ThirdFile';

import { _decorator, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TestError')
export class TestError {
    private secondFile: SecondFile;
    private thirdFile: ThirdFile;

    @property(Node[])
    snakeBody: Node[] = [];

    constructor() {
        this.secondFile = new SecondFile();
        this.thirdFile = new ThirdFile();
    }
}