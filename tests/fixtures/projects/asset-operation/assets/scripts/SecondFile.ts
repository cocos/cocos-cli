import { ThirdFile } from './ThirdFile';
import { _decorator, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SecondFile')
export class SecondFile extends ThirdFile {

    @property(Node)
    snakeBody: Node[] = [];

    public load(): void {
        console.log('SecondFile loaded');
    }
}