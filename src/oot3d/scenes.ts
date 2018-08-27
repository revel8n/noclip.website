
import * as CMAB from './cmab';
import * as CMB from './cmb';
import * as ZAR from './zar';

import * as UI from '../ui';

import { SceneDesc, CmbRenderer } from './render';
import { SceneGroup, MainScene, Texture } from '../viewer';
import ArrayBufferSlice from '../ArrayBufferSlice';
import { RenderState } from '../render';

class MultiScene implements MainScene {
    public textures: Texture[] = [];

    constructor(public scenes: CmbRenderer[]) {
        for (const scene of scenes)
            this.textures = this.textures.concat(scene.textures);
    }

    public createPanels(): UI.Panel[] {
        const layerPanel = new UI.LayerPanel();
        layerPanel.setLayers(this.scenes);
        return [layerPanel];
    }

    public render(state: RenderState): void {
        this.scenes.forEach((scene) => {
            scene.render(state);
        });
    }

    public destroy(gl: WebGL2RenderingContext) {
        this.scenes.forEach((scene) => scene.destroy(gl));
    }
}

function basename(str: string): string {
    const parts = str.split('/');
    return parts.pop();
}

function setExtension(str: string, ext: string): string {
    const dot = str.lastIndexOf('.');
    if (dot < 0)
        return `${str}${ext}`;
    else
        return `${str.slice(0, dot)}${ext}`;
}

export function createSceneFromZARBuffer(gl: WebGL2RenderingContext, buffer: ArrayBufferSlice): MainScene {
    const zar = ZAR.parse(buffer);
    const cmbFiles = zar.files.filter((file) => file.name.endsWith('.cmb'));
    const renderers = cmbFiles.map((cmbFile) => {
        const cmbRenderer = new CmbRenderer(gl, CMB.parse(cmbFile.buffer), cmbFile.name);
        const cmabFileName = `misc/${basename(setExtension(cmbFile.name, '.cmab'))}`;
        const cmabFile = zar.files.find((file) => file.name === cmabFileName);
        if (cmabFile)
            cmbRenderer.bindCMAB(CMAB.parse(cmabFile.buffer));
        return cmbRenderer;
    });
    return new MultiScene(renderers);
}

const id = "oot3d";
const name = "Ocarina of Time 3D";
const sceneDescs: SceneDesc[] = [
    { name: "Inside the Deku Tree", id: "ydan" },
    { name: "Inside the Deku Tree (Boss)", id: "ydan_boss" },
    { name: "Dodongo's Cavern", id: "ddan" },
    { name: "Dodongo's Cavern (Boss)", id: "ddan_boss" },
    { name: "Jabu-Jabu's Belly", id: 'bdan' },
    { name: "Jabu-Jabu's Belly (Boss)", id: 'bdan_boss' },
    { name: "Forest Temple", id: 'bmori1' },
    { name: "Forest Temple (Boss)", id: "moriboss" },
    { name: "Fire Temple", id: "hidan" },
    { name: "Fire Temple (Boss)", id: "fire_bs" },
    { name: "Water Temple", id: "mizusin" },
    { name: "Water Temple (Boss)", id: "mizusin_boss" },
    { name: "Spirit Temple", id: "jyasinzou" },
    { name: "Spirit Temple (Mid-Boss)", id: "jyasinzou_boss" },
    { name: "Shadow Temple", id: "hakadan" },
    { name: "Shadow Temple (Boss)", id: "hakadan_boss" },
    { name: "Bottom of the Well", id: "hakadan_ch" },
    { name: "Ice Cavern", id: "ice_doukutu" },
    { name: "Gerudo Training Grounds", id: "men" },
    { name: "Thieve's Hideout", id: "gerudoway" },
    { name: "Ganon's Castle", id: "ganontika" },
    { name: "Ganon's Castle (Crumbling)", id: "ganontikasonogo" },
    { name: "Ganon's Castle (Outside)", id: "ganon_tou" },
    { name: "Ganon's Castle Tower", id: "ganon" },
    { name: "Ganon's Castle Tower (Crumbling)", id: "ganon_sonogo" },
    { name: "Second-To-Last Boss Ganondorf", id: "ganon_boss" },
    { name: "Final Battle Against Ganon", id: "ganon_demo" },
    { name: "Ganondorf's Death", id: "ganon_final" },
    { name: "Hyrule Field", id: "spot00" },
    { name: "Kakariko Village", id: "spot01" },
    { name: "Kakariko Graveyard", id: "spot02" },
    { name: "Zora's River", id: "spot03" },
    { name: "Kokiri Firest", id: "spot04" },
    { name: "Sacred Forest Meadow", id: "spot05" },
    { name: "Lake Hylia", id: "spot06" },
    { name: "Zora's Domain", id: "spot07" },
    { name: "Zora's Fountain", id: "spot08" },
    { name: "Gerudo Valley", id: "spot09" },
    { name: "Lost Woods", id: "spot10" },
    { name: "Desert Colossus", id: "spot11" },
    { name: "Gerudo's Fortress", id: "spot12" },
    { name: "Haunted Wasteland", id: "spot13" },
    { name: "Hyrule Castle", id: "spot15" },
    { name: "Death Mountain", id: "spot16" },
    { name: "Death Mountain Crater", id: "spot17" },
    { name: "Goron City", id: "spot18" },
    { name: "Lon Lon Ranch", id: "spot20" },
    { name: "", id: "spot99" },

    { name: "Market Entrance (Day)", id: "entra_day" },
    { name: "Market Entrance (Night)", id: "entra_night" },
    { name: "Market Entrance (Ruins)", id: "entra_ruins" },
    { name: "Market (Day)", id: "market_day" },
    { name: "Market (Night)", id: "market_night" },
    { name: "Market (Ruins)", id: "market_ruins" },
    { name: "Market Back-Alley (Day)", id: "market_alley" },
    { name: "Market Back-Alley (Night)", id: "market_alley_n" },
    { name: "Lots'o'Pots", id: "miharigoya" },
    { name: "Bombchu Bowling Alley", id: 'bowling' },
    { name: "Temple of Time (Outside, Day)", id: "shrine" },
    { name: "Temple of Time (Outside, Night)", id: "shrine_n" },
    { name: "Temple of Time (Outside, Adult)", id: "shrine_r" },
    { name: "Temple of Time (Interior)", id: "tokinoma" },
    { name: "Chamber of Sages", id: "kenjyanoma" },
    { name: "Zora Shop", id: "zoora" },
    { name: "Dampe's Hut", id: "hut" },

    { name: "Great Fairy Fountain", id: "daiyousei_izumi" },
    { name: "Small Fairy Fountain", id: "yousei_izumi_tate" },
    { name: "Magic Fairy Fountain", id: "yousei_izumi_yoko" },

    { name: "Castle Courtyard", id: "hairal_niwa" },
    { name: "Castle Courtyard (Night)", id: "hairal_niwa_n" },
    { name: '', id: "hakaana" },
    { name: "Grottos", id: "kakusiana" },
    { name: "Royal Family's Tomb", id: "hakaana_ouke" },
    { name: "Dampe's Grave & Windmill Hut", id: "hakasitarelay" },
    { name: "Cutscene Map", id: "hiral_demo" },
    { name: "Hylia Lakeside Laboratory", id: "hylia_labo" },
    { name: "Puppy Woman's House", id: "kakariko_impa" },
    { name: "Skulltula House", id: "kinsuta" },
    { name: "Impa's House", id: "labo" },
    { name: "Granny's Potion Shop", id: "mahouya" },
    { name: "Zelda's Courtyard", id: "nakaniwa" },
    { name: "Market Potion Shop", id: "shop_alley" },
    { name: "Kakariko Potion Shop", id: "shop_drag" },
    { name: "Happy Mask Shop", id: "shop_face" },
    { name: "Goron Shop", id: "shop_golon" },
    { name: "Bombchu Shop", id: "shop_night" },
    { name: "Talon's House", id: "souko" },
    { name: "Stables", id: "stable" },
    { name: "Shooting Gallery", id: "syatekijyou" },
    { name: "Treasure Chest Game", id: "takaraya" },
    { name: "Carpenter's Tent", id: "tent" },

    { name: '', id: "k_home" },
    { name: '', id: "kakariko" },
    { name: '', id: "kokiri" },
    { name: '', id: "link" },
    { name: '', id: "shop" },
    { name: "Fishing Pond", id: "turibori" },
].map((entry): SceneDesc => {
    const name = entry.name || entry.id;
    return new SceneDesc(name, entry.id);
});

export const sceneGroup: SceneGroup = { id, name, sceneDescs };
