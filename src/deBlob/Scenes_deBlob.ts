
import { BasicGXRendererHelper, fillSceneParamsDataOnTemplate, GXTextureHolder } from "../gx/gx_render";
import { GfxDevice } from "../gfx/platform/GfxPlatform";
import { HSD_JObjRoot_Instance, HSD_JObjRoot_Data, HSD_AObj_Instance, TRB_MeshResource_Instance, TRB_MeshResource_Data } from "./Toshi_Render";
import { ViewerRenderInput, SceneGfx, SceneGroup } from "../viewer";
import { GfxRenderCache } from "../gfx/render/GfxRenderCache";
import { SceneDesc, SceneContext } from "../SceneBase";
import { HSD_ArchiveParse, HSD_JObjLoadJoint, HSD_JObjRoot, HSD_Archive_FindPublic, HSD_AObjLoadAnimJoint, HSD_AObjLoadMatAnimJoint, HSD_AObjLoadShapeAnimJoint, HSD_Archive, HSD_LoadContext, HSD_LoadContext__ResolvePtr, HSD_LoadContext__ResolveSymbol } from "../SuperSmashBrosMelee/SYSDOLPHIN";
import { TRB_ArchiveParse, TRB_LoadContext, TRB_LoadContext__ProcessSymbolResources, TRB_MeshInfo, TRB_TMeshResource, TRB_TResource, TRB_TextureResource } from "./Toshi";
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

export class deBlobRenderer extends BasicGXRendererHelper {
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

const pathBase = `deBlob`;

class deBlobMapDesc implements SceneDesc {
    constructor(public id: string, public name: string = id, public path: string = "") {}

    public async createScene(device: GfxDevice, context: SceneContext): Promise<SceneGfx> {
        const dataFetcher = context.dataFetcher;
        let data: NamedArrayBufferSlice;
        const context_map : Map<string, TRB_LoadContext> = new Map([]);
        const resource_map : Map<string, TRB_TResource[]> = new Map([]);
        const mesh_resources: Map<string, TRB_TMeshResource> = new Map([]);

        const scene = new deBlobRenderer(device);

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

        const loadResource = (resource_name: string | null, transform: mat4 | null, cell_ctx: TRB_LoadContext | null | undefined) : void => {
            if (!resource_name)
                return;

            const mapped_name = resource_name.toLowerCase();

            const mesh_resource = cell_ctx?.mesh_resources.get(mapped_name) ?? mesh_resources.get(mapped_name);
            if (!mesh_resource) {
                console.log(`Could not find resource: ${mapped_name}`);
                return;
            }

            const mesh_resource_instance = new TRB_MeshResource_Instance(scene.modelCache.loadMeshResource(mesh_resource));
            mesh_resource_instance.transform = transform ?? mat4.create();

            if (mesh_resource.type === "twld") {
            }

            scene.mesh_resources.push(mesh_resource_instance);
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

        try {
            const ctx = await loadArchive(`${pathBase}/${this.path}/terrain.trb`);
    
            if (ctx) {
                for (const terrain_resource of ctx.terrain_resources) {
                    for (const terrain_info of terrain_resource.terrain_info) {
                        for (const cell_info of terrain_info.cell_info) {
                            const cell_name = cell_info.cell_name;
                            const cell_path = cell_info.cell_path;
                            let cell_transform = cell_info.transform ? mat4.clone(cell_info.transform) : mat4.create();
                            let position: vec3 | null = null;

                            //if (cell_name !== "Cell1x1")
                                //continue;

                            if (cell_info.position && cell_info.position2) {
                                //position = vec3.add(vec3.create(), cell_info.position, cell_info.position2);
                                //position = vec3.add(position, position, vec3.fromValues(37.50003, 3e-06, 37.49999));
                                //cell_transform[12] = cell_info.position[0];
                                //cell_transform[13] = cell_info.position[1];
                                //cell_transform[14] = cell_info.position[2];
                                //mat4.translate(cell_transform, cell_transform, cell_info.position);
                            }

                            const cell_ctx = cell_path ? await loadArchive(`${pathBase}\\${cell_path}`) : null;

                            loadResource(cell_name, cell_transform, cell_ctx);

                            //if (cell_index > 2) return;

                            cell_info.instance_info.forEach((instance_info, instance_index) => {
                                const resource_name = instance_info.resource_name ?? instance_info.instance_name;
                                const uv_resource_name = instance_info.uv_name;
                                const transform = instance_info.transform ? mat4.clone(instance_info.transform) : mat4.create();

                                /*if (instance_info.position) {
                                    transform[12] = instance_info.position[0];
                                    transform[13] = instance_info.position[1];
                                    transform[14] = instance_info.position[2];
                                }*/
    
                                //if (uv_resource_name)
                                    //return;

                                loadResource(resource_name, transform, cell_ctx);
                            });
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
    new deBlobMapDesc("Abyss", "Abyss", "Data/LEVELS/PRODUCTION/Singleplayer/Abyss"),
	new deBlobMapDesc("Billboard_Orama_Sprint", "Billboard_Orama_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Billboard_Orama_Sprint"),
	new deBlobMapDesc("Blob_In_Venice_Sprint", "Blob_In_Venice_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Blob_In_Venice_Sprint"),
    new deBlobMapDesc("Bridge", "Bridge", "Data/LEVELS/PRODUCTION/Singleplayer/Bridge"),
    new deBlobMapDesc("Cannons_Above_Sprint", "Cannons_Above_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Cannons_Above_Sprint"),
    new deBlobMapDesc("Dam", "Dam", "Data/LEVELS/PRODUCTION/Singleplayer/Dam"),
	new deBlobMapDesc("Deep_Down_Sprint", "Deep_Down_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Deep_Down_Sprint"),
	new deBlobMapDesc("Forest_Sprint", "Forest_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Forest_Sprint"),
    new deBlobMapDesc("Full_Metal_Inky_Sprint", "Full_Metal_Inky_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Full_Metal_Inky_Sprint"),
    new deBlobMapDesc("Guggentraz", "Guggentraz", "Data/LEVELS/PRODUCTION/Singleplayer/Guggentraz"),
    new deBlobMapDesc("Hells_Angels_Attack_Sprint", "Hells_Angels_Attack_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Hells_Angels_Attack_Sprint"),
    new deBlobMapDesc("Hill_Climb_Sprint", "Hill_Climb_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Hill_Climb_Sprint"),
    new deBlobMapDesc("Hotplates_R_US_Sprint", "Hotplates_R_US_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Hotplates_R_US_Sprint"),
    new deBlobMapDesc("Ink_Harvest", "Ink_Harvest", "Data/LEVELS/PRODUCTION/Singleplayer/Ink_Harvest"),
    new deBlobMapDesc("Inky_Academy_Sprint", "Inky_Academy_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Inky_Academy_Sprint"),
    new deBlobMapDesc("Inkyball_Sprint", "Inkyball_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Inkyball_Sprint"),
    new deBlobMapDesc("Inkydocks", "Inkydocks", "Data/LEVELS/PRODUCTION/Singleplayer/Inkydocks"),
    new deBlobMapDesc("LastResort", "LastResort", "Data/LEVELS/PRODUCTION/Singleplayer/LastResort"),
    new deBlobMapDesc("Lost_Highway_Sprint", "Lost_Highway_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Lost_Highway_Sprint"),
    new deBlobMapDesc("Mile_High_Fight_Club_Sprint", "Mile_High_Fight_Club_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Mile_High_Fight_Club_Sprint"),
    new deBlobMapDesc("Miles_O_Silos_Sprint", "Miles_O_Silos_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Miles_O_Silos_Sprint"),
    new deBlobMapDesc("Military_02", "Military_02", "Data/LEVELS/PRODUCTION/Singleplayer/Military_02"),
    new deBlobMapDesc("Ship2Ship_Sprint", "Ship2Ship_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Ship2Ship_Sprint"),
    new deBlobMapDesc("Slums", "Slums", "Data/LEVELS/PRODUCTION/Singleplayer/Slums"),
    new deBlobMapDesc("Spaceship", "Spaceship", "Data/LEVELS/PRODUCTION/Singleplayer/Spaceship"),
    new deBlobMapDesc("St_Peters_Square_Sprint", "St_Peters_Square_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/St_Peters_Square_Sprint"),
    new deBlobMapDesc("Stamps_Sprint", "Stamps_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Stamps_Sprint"),
    new deBlobMapDesc("Top_Of_The_World_Sprint", "Top_Of_The_World_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Top_Of_The_World_Sprint"),
    new deBlobMapDesc("Tower_Of_Babel_Sprint", "Tower_Of_Babel_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Tower_Of_Babel_Sprint"),
    new deBlobMapDesc("Trainspotting_Sprint", "Trainspotting_Sprint", "Data/LEVELS/PRODUCTION/Singleplayer/Trainspotting_Sprint"),
];

const id = `deBlob`;
const name = "de Blob";

export const sceneGroup: SceneGroup = {
    id, name, sceneDescs,
};
