
import { BasicGXRendererHelper, fillSceneParamsDataOnTemplate, GXTextureHolder } from "../gx/gx_render";
import { GfxDevice } from "../gfx/platform/GfxPlatform";
import { HSD_JObjRoot_Instance, HSD_JObjRoot_Data, HSD_AObj_Instance, TRB_MeshResource_Instance, TRB_MeshResource_Data } from "./Toshi2_Render";
import { ViewerRenderInput, SceneGfx, SceneGroup } from "../viewer";
import { GfxRenderCache } from "../gfx/render/GfxRenderCache";
import { SceneDesc, SceneContext } from "../SceneBase";
import { HSD_ArchiveParse, HSD_JObjLoadJoint, HSD_JObjRoot, HSD_Archive_FindPublic, HSD_AObjLoadAnimJoint, HSD_AObjLoadMatAnimJoint, HSD_AObjLoadShapeAnimJoint, HSD_Archive, HSD_LoadContext, HSD_LoadContext__ResolvePtr, HSD_LoadContext__ResolveSymbol } from "../SuperSmashBrosMelee/SYSDOLPHIN";
import { TRB_ArchiveParse, TRB_LoadContext, TRB_LoadContext__ProcessSymbolResources, TRB_TCMD_MeshInfo, TRB_TMeshResource, TRB_TResource, TRB_TextureResource } from "./Toshi2";
import { colorFromRGBA8 } from "../Color";
import { assertExists, assert, fallbackUndefined } from "../util";
import ArrayBufferSlice from "../ArrayBufferSlice";
import { DataFetcher, NamedArrayBufferSlice } from "../DataFetcher";
import { CameraController } from "../Camera";
import { mat4, vec3 } from "gl-matrix";
import { TextureInputGX } from "../gx/gx_texture";
import * as GX from "../gx/gx_enum";
import * as GX_Material from '../gx/gx_material';
import * as GX_Texture from '../gx/gx_texture';
import * as UI from '../ui';

class ModelCache {
    public data: Map<string, TRB_MeshResource_Data> = new Map<string, TRB_MeshResource_Data>();

    constructor(public device: GfxDevice, public cache: GfxRenderCache) {
    }

    public loadMeshResource(mesh_resource: TRB_TMeshResource) {
        let data = this.data.get(mesh_resource.name);
        if (data)
            return data;

        data = new TRB_MeshResource_Data(this.device, this.cache, mesh_resource);

        this.data.set(mesh_resource.name, data);

        return data;
    }

    public destroy(device: GfxDevice): void {
        this.data.forEach((data, name) => {
            data.destroy(device);
        });
    }
}

export class deBlob2Renderer extends BasicGXRendererHelper {
    public mesh_resources: TRB_MeshResource_Instance[] = [];
    public modelCache: ModelCache;
    public textureHolder = new GXTextureHolder();

    constructor(device: GfxDevice) {
        super(device);

        this.modelCache = new ModelCache(device, this.getCache());
    }

    public adjustCameraController(c: CameraController) {
        c.setSceneMoveSpeedMult(4/60);
    }

    public prepareToRender(device: GfxDevice, viewerInput: ViewerRenderInput): void {
        const renderInstManager = this.renderHelper.renderInstManager;
        const template = this.renderHelper.pushTemplateRenderInst();

        const deltaTimeInFrames = viewerInput.deltaTime / 1000.0 * 60.0;

        fillSceneParamsDataOnTemplate(template, viewerInput);

        for (let i = 0; i < this.mesh_resources.length; i++) {
            const root = this.mesh_resources[i];
            root.calcAnim(deltaTimeInFrames);
            root.calcMtx(viewerInput);
            root.draw(device, this.renderHelper.renderInstManager, viewerInput);
        }

        renderInstManager.popTemplateRenderInst();
        this.renderHelper.prepareToRender(device);
    }

    public createPanels(): UI.Panel[] {
        const panels: UI.Panel[] = [];

        const layersPanel = new UI.LayerPanel();
        layersPanel.setLayers(this.mesh_resources);
        panels.push(layersPanel);

        const renderHacksPanel = new UI.Panel();
        renderHacksPanel.customHeaderBackgroundColor = UI.COOL_BLUE_COLOR;
        renderHacksPanel.setTitle(UI.RENDER_HACKS_ICON, 'Render Hacks');
        panels.push(renderHacksPanel);

        return panels;
    }

    public destroy(device: GfxDevice): void {
        super.destroy(device);
        this.modelCache.destroy(device);
    }
}

const pathBase = `deBlob2`;

class deBlob2MapDesc implements SceneDesc {
    constructor(public id: string, public name: string = id, public path: string = "") {}

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const dataFetcher = context.dataFetcher;
        let data: NamedArrayBufferSlice;
        const context_map : Map<string, TRB_LoadContext> = new Map([]);
        const resource_map : Map<string, TRB_TResource[]> = new Map([]);
        const mesh_resources: Map<string, TRB_TMeshResource> = new Map([]);

        const scene = new deBlob2Renderer(device);

        const loadArchive = async (path: string) : Promise<TRB_LoadContext | undefined> => {
            try {
                data = await dataFetcher.fetchData(`${path}`);

                const archive = TRB_ArchiveParse(data);
                const ctx = new TRB_LoadContext(archive);

                const symbol_resources = TRB_LoadContext__ProcessSymbolResources(ctx);

                const asset_name = path.substring(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
                const mapped_name = asset_name.split(".")[0];
                context_map.set(mapped_name, ctx);
                resource_map.set(mapped_name, symbol_resources);

                const textures: TextureInputGX[] = [];
                ctx.texture_resources.forEach((texture, key) => {
                    textures.push({
                        name: texture.name,
                        format: texture.image_format,
                        width: texture.width,
                        height: texture.height,
                        data: texture.image_data,
                        mipCount: texture.mipmap_count,
                        paletteFormat: texture.palette_data.byteLength > 0 ? texture.palette_format : null,
                        paletteData: texture.palette_data
                     });
                })
                try {
                    scene.textureHolder.addTextures(device, textures);
                } catch (error) {
                    console.log(error);
                }

                return ctx;
            } catch {
            }

            return undefined;
        }

        const loadResource = (resource_name: string | null, transform: mat4 | null, cell_ctx: TRB_LoadContext | null | undefined) : boolean => {
            if (!resource_name)
                return false;

            const mapped_name = resource_name.toLowerCase();

            const mesh_resource = cell_ctx?.mesh_resources.get(mapped_name) ?? mesh_resources.get(mapped_name);
            if (!mesh_resource) {
                console.log(`Could not find resource: ${mapped_name}`);
                return false;
            }

            const mesh_resource_instance = new TRB_MeshResource_Instance(scene.modelCache.loadMeshResource(mesh_resource));
            mesh_resource_instance.transform = transform ?? mat4.create();

            scene.mesh_resources.push(mesh_resource_instance);

            return true;
        }

        const paths: string[] = ["Data/Blob_FX", this.path];

        for (const search_path of paths) {
            for (const name of commonAssetNames) {
                const ctx = await loadArchive(`${pathBase}/${search_path}/${name}`);
    
                // gather common mesh resource assets
                ctx?.mesh_resources.forEach((mesh_resource, key) => {
                    mesh_resources.set(key, mesh_resource);
                });
            }
        }

        let has_cell_name_instance: boolean = false;
        let has_mesh_instance_name_0_instance: boolean = false;
        let has_mesh_instance_name_1_instance: boolean = false;
        let has_mesh_instance_name_2_instance: boolean = false;
        let has_mesh_instance_name_3_instance: boolean = false;
        let has_mesh_instance_name_4_instance: boolean = false;

        try {
            const ctx = await loadArchive(`${pathBase}/${this.path}/terrain.trb`);
    
            if (ctx) {
                for (const terrain_resource of ctx.terrain_resources) {
                    for (const cell_info of terrain_resource.cell_info) {
                        const cell_name = cell_info.cell_name;
                        const cell_path = cell_info.cell_path;

                        const cell_ctx = cell_path ? await loadArchive(`${pathBase}\\${cell_path}`) : null;

                        for (const cell_instance of cell_info.cell_instances) {
                            const cell_position = cell_instance.unknown0 ?? vec3.create();
                            let cell_transform = mat4.create(); ///*/cell_info.transform ?? terrain_resource.transform; //*/mat4.fromTranslation(mat4.create(), vec3.fromValues(cell_position[0], cell_position[1], cell_position[2]));
                            //mat4.translate(cell_transform, cell_transform, vec3.fromValues(cell_position[0], cell_position[1], cell_position[2]));

                            //loadResource(cell_instance.instance_name, cell_transform, cell_ctx);
                        }

                        for (const mesh_instance of cell_info.mesh_instances) {
                            let cell_transform = mesh_instance.transform;

                            has_mesh_instance_name_0_instance = loadResource(mesh_instance.instance_name_0, cell_transform, cell_ctx) || has_mesh_instance_name_0_instance;
                            has_mesh_instance_name_1_instance = loadResource(mesh_instance.instance_name_1, cell_transform, cell_ctx) || has_mesh_instance_name_1_instance;
                            //has_mesh_instance_name_2_instance = loadResource(mesh_instance.instance_name_2, cell_transform, cell_ctx) || has_mesh_instance_name_2_instance;
                            //has_mesh_instance_name_3_instance = loadResource(mesh_instance.instance_name_3, cell_transform, cell_ctx) || has_mesh_instance_name_3_instance;
                            //has_mesh_instance_name_4_instance = loadResource(mesh_instance.instance_name_4, cell_transform, cell_ctx) || has_mesh_instance_name_4_instance;
                        }
                    }
                }
            }
    
            ctx?.mesh_resources.forEach((mesh_resource, name) => {
                scene.mesh_resources.push(new TRB_MeshResource_Instance(scene.modelCache.loadMeshResource(mesh_resource)));
            });
        } catch {
        }

        try {
            const ctx = await loadArchive(`${pathBase}/${this.path}/entities.trb`);

            if (ctx) {
                for (const entity_resource of ctx?.entity_resources) {
                    for (const entity_info of entity_resource.entity_info) {
                        for (const property_name of ["Mesh", "Mesh2"]) {
                            const mesh_property = entity_info.properties.get(property_name);

                            if (!mesh_property)
                                continue;
        
                            const resource_name = mesh_property.data_value as string;
                            if (!resource_name)
                                continue;
        
                            const transform = entity_info.transform;
        
                            const asset_name = resource_name.substring(Math.max(resource_name.lastIndexOf("/"), resource_name.lastIndexOf("\\")) + 1);
                            const mapped_name = asset_name.split(".")[0];
            
                            loadResource(mapped_name, transform, null);
                        }
                    }
                }
            }
    
            ctx?.mesh_resources.forEach((mesh_resource, name) => {
                scene.mesh_resources.push(new TRB_MeshResource_Instance(scene.modelCache.loadMeshResource(mesh_resource)));
            });
        } catch {
        }

        console.log(
            `loaded cell name instance: ${has_cell_name_instance}\n
            loaded mesh name instance 0: ${has_mesh_instance_name_0_instance}\n
            loaded mesh name instance 1: ${has_mesh_instance_name_1_instance}\n
            loaded mesh name instance 2: ${has_mesh_instance_name_2_instance}\n
            loaded mesh name instance 3: ${has_mesh_instance_name_3_instance}\n
            loaded mesh name instance 4: ${has_mesh_instance_name_4_instance}\n
            `)

        return scene;
    }
}

const commonAssetNames: string[] = [
    "AssetPack.trb",
    "CommonAssets.trb",
    "InstanceAssetPack.trb",
    "LevelAssets.trb",
    "RegionAssets.trb",
    "Region1Assets.trb",
    "WorldAssets.trb",
];

const sceneDescs = [
    "Singleplayer Levels",
    new deBlob2MapDesc("ParadiseIsland", "Paradise Island", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/01_SP_PARADISE_ISLAND"),
	new deBlob2MapDesc("PrismaCity", "Prisma City", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/02_SP_PRISMA_CITY"),
	new deBlob2MapDesc("CultOfBlanc", "Cult Of Blanc", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/03_SP_CULT_OF_BLANC"),
    new deBlob2MapDesc("BlancHouse", "BlancHouse", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/04_SP_BLANCHOUSE"),
    new deBlob2MapDesc("PrismaStateCollege", "Prisma State College", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/05_SP_PRISMA_STATE_COLLEGE"),
    new deBlob2MapDesc("Biodome", "Biodome", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/06_SP_BIODOME"),
	new deBlob2MapDesc("PopWorks", "PopWorks", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/07_SP_POPWORKS"),
	new deBlob2MapDesc("PinwheelFactory", "Pinwheel Factory", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/08_SP_PINWHEEL_FACTORY"),
    new deBlob2MapDesc("IceStation", "Ice Station", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/09_SP_ICE_STATION"),
    new deBlob2MapDesc("InkPoint", "InkPoint", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/10_SP_INKPOINT"),
    new deBlob2MapDesc("Rocket", "Rocket", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/11_SP_ROCKET"),
    new deBlob2MapDesc("Space", "Space", "Data/LEVELS/PRODUCTION_BLOB2/Singleplayer/12_SP_SPACE"),
];

const id = `deBlob2`;
const name = "de Blob 2";

export const sceneGroup: SceneGroup = {
    id, name, sceneDescs,
};
