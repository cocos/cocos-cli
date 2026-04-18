import { getServiceAll, register, Service } from '../service';
import type {
    AssetService,
    ComponentService,
    EditorService,
    EngineService,
    NodeService,
    PrefabService,
    ScriptService,
    ServiceName,
} from '../service';

describe('cocos-cli-types: service', () => {
    it('should be able to import getServiceAll', () => {
        const _getServiceAll: typeof getServiceAll = getServiceAll;
        expect(1).toBe(1);
    });

    it('should be able to import register', () => {
        const _register: typeof register = register;
        expect(1).toBe(1);
    });

    it('should be able to import Service', () => {
        const _service: typeof Service = Service;
        expect(1).toBe(1);
    });

    it('should be able to import ServiceName', () => {
        const name: ServiceName = 'Editor';
        expect(name).toBe('Editor');
    });

    it('should be able to import AssetService', () => {
        let service: Partial<AssetService> = {};
        expect(service).toBeDefined();
    });

    it('should be able to import ComponentService', () => {
        let service: Partial<ComponentService> = {};
        expect(service).toBeDefined();
    });

    it('should be able to import EditorService', () => {
        let service: Partial<EditorService> = {};
        expect(service).toBeDefined();
    });

    it('should be able to import EngineService', () => {
        let service: Partial<EngineService> = {};
        expect(service).toBeDefined();
    });

    it('should be able to import NodeService', () => {
        let service: Partial<NodeService> = {};
        expect(service).toBeDefined();
    });

    it('should be able to import PrefabService', () => {
        let service: Partial<PrefabService> = {};
        expect(service).toBeDefined();
    });

    it('should be able to import ScriptService', () => {
        let service: Partial<ScriptService> = {};
        expect(service).toBeDefined();
    });
});
