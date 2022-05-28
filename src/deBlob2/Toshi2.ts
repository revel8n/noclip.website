import ArrayBufferSlice from "../ArrayBufferSlice";
import { readString, assert, flatten } from "../util";
import { vec3, mat4, vec4 } from "gl-matrix";
import * as GX from "../gx/gx_enum";
import { compileVtxLoader, GX_VtxAttrFmt, GX_VtxDesc, LoadedVertexData, GX_Array, LoadedVertexLayout, getAttributeByteSize } from "../gx/gx_displaylist";
import { Color, colorNewCopy, TransparentBlack, colorFromRGBA8, colorNewFromRGBA8 } from "../Color";
import { calcPaletteSize, calcTextureSize } from "../gx/gx_texture";
import { Endianness } from "../endian";
import { Format } from "../SuperMario64DS/nitro_tex";

export interface TRB_ArchiveSection {
    section_name: string;
    section_size: number;

    section_zsize: number;
    section_data_offset: number;
    section_relocation_offset: number;
    section_relocation_count: number;
}

export interface TRB_ArchiveSymbol {
    type: string;
    name: string;
    sectionIndex: number;
    offset: number;
}

export interface TRB_ArchiveRelocation {
    sourceIndex: number;
    targetIndex: number;
    sourceOffset: number;
    targetOffset: number;
}

export interface TRB_ArchiveDataBlock {
    magic: number;
    dataBuffer: ArrayBufferSlice;
    littleEndian?: boolean;
}

export interface TRB_Archive extends TRB_ArchiveDataBlock {
    section_info: TRB_ArchiveSection[];
    symbol_info: TRB_ArchiveSymbol[];
    relocation_info: TRB_ArchiveRelocation[];
    relocation_mappings: Map<number, number>;

    string_table_base_offset: number;
}

export interface RelocationMapping {

}

export function TRB_ArchiveParse(buffer: ArrayBufferSlice): TRB_Archive {
    const view = buffer.createDataView(0);
    const dataBuffer = buffer;
    const endian_value = view.getUint8(0x04);
    const littleEndian = endian_value !== 0;

    const magic = view.getUint32(0x00, littleEndian);

    const section_base_offset = 0x80;
    const section_count = view.getUint32(0x0C, littleEndian);
    const section_size = view.getUint32(0x10, littleEndian);

    const symbol_base_offset = section_base_offset + section_size;
    const symbol_count = view.getUint32(0x14, littleEndian);
    const symbol_size = view.getUint32(0x18, littleEndian);

    const relocation_base_offset = view.getUint32(0x1C, littleEndian);
    const relocation_size = view.getUint32(0x20, littleEndian);
    const relocation_count = relocation_size / 0x06;

    const section_info: TRB_ArchiveSection[] = [];
    const symbol_info: TRB_ArchiveSymbol[] = [];
    const relocation_info: TRB_ArchiveRelocation[] = [];
    const relocation_mappings = new Map<number, number>();

    let string_table_base_offset = 0;

    let section_offset = 0;
    for (let section_index = 0; section_index < section_count; ++ section_index) {
        const section_name_offset = view.getUint32(section_base_offset + section_offset + 0x04, littleEndian);
        const section_size = view.getUint32(section_base_offset + section_offset + 0x10, littleEndian);
        const section_zsize = view.getUint32(section_base_offset + section_offset + 0x14, littleEndian);
        const section_data_offset = view.getUint32(section_base_offset + section_offset + 0x18, littleEndian);
        const section_relocation_count = view.getUint32(section_base_offset + section_offset + 0x20, littleEndian);
        const section_relocation_offset = view.getUint32(section_base_offset + section_offset + 0x24, littleEndian);

        if (section_index === 0) {
            string_table_base_offset = section_data_offset;
        }

        const section_name = readString(buffer, string_table_base_offset + section_name_offset)

        section_info.push({section_name, section_size, section_zsize, section_data_offset, section_relocation_count, section_relocation_offset});

        section_offset += 0x30;
    }

    let symbol_offset = 0;
    for (let symbol_index = 0; symbol_index < symbol_count; ++ symbol_index)
    {
        const type = readString(buffer, symbol_base_offset + symbol_offset + 0x00, 4);
        const symbol_name_offset = view.getUint32(symbol_base_offset + symbol_offset + 0x0C, littleEndian);
        const name = readString(buffer, string_table_base_offset + symbol_name_offset);
        const sectionIndex = view.getUint16(symbol_base_offset + symbol_offset + 0x08, littleEndian);
        const offset = section_info[sectionIndex].section_data_offset + view.getUint32(symbol_base_offset + symbol_offset + 0x04, littleEndian);

        symbol_info.push({type, name, sectionIndex, offset});

        symbol_offset += 0x10;
    }

    let relocation_base_index = 0;
    for (let section_index = 0; section_index < section_count; ++ section_index) {
        const section_data_offset = section_info[section_index].section_data_offset;
        const section_relocation_count = section_info[section_index].section_relocation_count;
        const section_relocation_offset = section_info[section_index].section_relocation_offset;

        let relocation_offset = section_relocation_offset;
        for (let relocation_index = 0; relocation_index < section_relocation_count; ++relocation_index) {
            const sourceIndex = section_index;
            const targetIndex = view.getUint16(relocation_base_offset + relocation_offset + 0x00, littleEndian);
            const sourceOffset = section_data_offset + ((view.getUint16(relocation_base_offset + relocation_offset + 0x04, littleEndian) << 16) | view.getUint16(relocation_base_offset + relocation_offset + 0x02, littleEndian));
            const sourceOffsetValue = view.getUint32(sourceOffset, littleEndian);
            const targetOffset = sourceOffsetValue + section_info[targetIndex].section_data_offset;

            relocation_info.push({sourceIndex, targetIndex, sourceOffset, targetOffset});
            relocation_mappings.set(sourceOffset, relocation_base_index + relocation_index);

            relocation_offset += 0x06;
        }

        relocation_base_index += section_relocation_count;
    }

    return { magic, dataBuffer, littleEndian, section_info, symbol_info, relocation_info, relocation_mappings, string_table_base_offset };
}

export function TRB_LoadContext__ProcessSymbolResources(ctx: TRB_LoadContext): TRB_TResource[] {
    const archive = ctx.archive;

    // calculate symbol offsets
    const symbol_info = archive.symbol_info;
    const symbol_count = symbol_info.length;;
    const symbol_resources: TRB_TResource[] = [];
    for (let i = 0; i < symbol_count; ++i) {
        const symbol_type = symbol_info[i].type;
        const symbol_name = symbol_info[i].name;
        const lookup_type = symbol_type.length > 0 ? symbol_type : symbol_name;
        const symbol_handler = resource_handlers.get(lookup_type);
        if (!symbol_handler)
            continue;

        const symbol_resource = symbol_handler(ctx, symbol_type, symbol_name, symbol_info[i].offset);
        if (!symbol_resource)
            continue;

        symbol_resources.push(symbol_resource);
    }

    return symbol_resources;
}

export function TRB_Archive__ResolvePtr(arc: TRB_Archive, offs: number): number | undefined {
    // Ensure that this is somewhere within our relocation table.
    let offset_index = arc.relocation_mappings.get(offs);
    if (offset_index === undefined) {
        return undefined;
    }

    return arc.relocation_info[offset_index].targetOffset;
}

export class TRB_LoadContext {
    buffer: ArrayBufferSlice;
    view: DataView;
    littleEndian?: boolean;

    name: string;

    mesh_resources: Map<string, TRB_TMeshResource>;
    terrain_resources: TRB_TerrainResource[];
    texture_resources: Map<string, TRB_TextureResource>;
    material_resources: Map<string, TRB_MaterialResource>;
    entity_resources: TRB_EntityResource[];

    constructor(public archive: TRB_Archive) {
        this.buffer = archive.dataBuffer;
        this.view = archive.dataBuffer.createDataView();
        this.littleEndian = archive.littleEndian;
        this.mesh_resources = new Map<string, TRB_TMeshResource>();
        this.terrain_resources = [];
        this.texture_resources = new Map<string, TRB_TextureResource>();
        this.material_resources = new Map<string, TRB_MaterialResource>();
        this.entity_resources = [];
    }
}

export function TRB_LoadContext__ResolvePtr(ctx: TRB_LoadContext, offs: number): number | undefined {
    return TRB_Archive__ResolvePtr(ctx.archive, offs);
}

export function TRB_LoadContext__ResolvePtrStruct<T>(ctx: TRB_LoadContext, offset: number | undefined, loadFunc: (ctx: TRB_LoadContext, offset: number | undefined) => T): T | null {
    if (offset === undefined)
        return null;

    return loadFunc(ctx, TRB_LoadContext__ResolvePtr(ctx, offset));
}

export function TRB_LoadContext__ResolvePtrString(ctx: TRB_LoadContext, offs: number): string | null {
    const offset = TRB_LoadContext__ResolvePtr(ctx, offs);
    if (offset === undefined)
        return null;

    const buffer = ctx.buffer;

    return readString(buffer, offset + 0x00);
}

export function TRB_LoadOffsetToStructPointerArray<T>(ctx: TRB_LoadContext, offset: number | undefined, loadFunc: (ctx: TRB_LoadContext, offset: number | undefined) => T): NotNull<T>[] {
    if (offset === undefined)
        return [];

    const littleEndian = ctx.littleEndian;
    const view = ctx.view;
    const count = view.getUint32(offset, littleEndian);

    return TRB_LoadPointerArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x04), count, loadFunc);
}

export function TRB_LoadOffsetToPointerArray<T>(ctx: TRB_LoadContext, offset: number | undefined, loadFunc: (ctx: TRB_LoadContext, offset: number | undefined) => T): NotNull<T>[] {
    if (offset === undefined)
        return [];

    const littleEndian = ctx.littleEndian;
    const view = ctx.view;
    const count = view.getUint32(offset, littleEndian);

    return TRB_LoadPointerArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x04), count, loadFunc);
}

type NotNull<T> = Exclude<T, null | undefined>;

export function TRB_LoadPointerArray<T>(ctx: TRB_LoadContext, offset: number | undefined, count: number, loadFunc: (ctx: TRB_LoadContext, offset: number | undefined) => T): NotNull<T>[] {
    if (offset === undefined)
        return [];

    const L: NotNull<T>[] = [];
    let offs = offset;
    for (let i = 0; i < count; ++i) {
        const value = loadFunc(ctx, TRB_LoadContext__ResolvePtr(ctx, offs));
        if (value !== null && value !== undefined)
            L.push(value as NotNull<T>);
        offs += 0x04;
    }
    return L;
}

function TRB_LoadStructArray<T>(ctx: TRB_LoadContext, offset: number | undefined, count: number, structSize: number, loadFunc: (ctx: TRB_LoadContext, offset: number) => T): NotNull<T>[] {
    if (offset === undefined)
        return [];

    const view = ctx.view;

    const L: NotNull<T>[] = [];
    for (let i = 0; i < count; i++) {
        const value = loadFunc(ctx, offset + i * structSize);
        if (value !== null && value !== undefined)
            L.push(value as NotNull<T>);
    }
    return L;
}

export function TRB_LoadOffsetToStructArray<T>(ctx: TRB_LoadContext, offset: number | undefined, structSize: number, loadFunc: (ctx: TRB_LoadContext, offset: number | undefined) => T): NotNull<T>[] {
    if (offset === undefined)
        return [];

    const littleEndian = ctx.littleEndian;
    const view = ctx.view;
    const count = view.getUint32(offset, littleEndian);

    return TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x04), count, structSize, loadFunc);
}

export interface TRB_TResource {
    name: string;
    type: string;
}

export interface TRB_TMeshResource extends TRB_TResource {
    collision: TRB_Collision | null;
    skeleton: TRB_Skeleton | null;
    mesh_info: TRB_TCMD_MeshInfo[] | null;
    bounding_sphere: vec4 | null;
}

export interface TRB_TMeshData {
    loadedVertexLayout: LoadedVertexLayout;
    loadedVertexData: LoadedVertexData;
}

export function TRB_LoadContext__RegisterMeshResource(ctx: TRB_LoadContext, resource: TRB_TMeshResource) {
    ctx.mesh_resources.set(resource.name.split(".")[0].toLowerCase(), resource);
}

export function TRB_LoadContext__RegisterTerrainResource(ctx: TRB_LoadContext, resource: TRB_TerrainResource) {
    ctx.terrain_resources.push(resource);
}

export function TRB_LoadContext__RegisterTextureResource(ctx: TRB_LoadContext, resource: TRB_TextureResource) {
    ctx.texture_resources.set(resource.name.split(".")[0].toLowerCase(), resource);
}

export function TRB_LoadContext__RegisterMaterialResource(ctx: TRB_LoadContext, resource: TRB_MaterialResource) {
    ctx.material_resources.set(resource.name.split(".")[0].toLowerCase(), resource);
}

export function TRB_LoadContext__RegisterEntityResource(ctx: TRB_LoadContext, resource: TRB_EntityResource) {
    ctx.entity_resources.push(resource);
}

export function readVec3(view: DataView, offset: number | undefined, littleEndian?: boolean): vec3 | null {
    if (offset === undefined)
        return null;

    const x = view.getFloat32(offset + 0x00, littleEndian);
    const y = view.getFloat32(offset + 0x04, littleEndian);
    const z = view.getFloat32(offset + 0x08, littleEndian);

    return vec3.fromValues(x, y, z);
}

export function readVec4(view: DataView, offset: number | undefined, littleEndian?: boolean): vec4 | null {
    if (offset === undefined)
        return null;

    const x = view.getFloat32(offset + 0x00, littleEndian);
    const y = view.getFloat32(offset + 0x04, littleEndian);
    const z = view.getFloat32(offset + 0x08, littleEndian);
    const w = view.getFloat32(offset + 0x0C, littleEndian);

    return vec4.fromValues(x, y, z, w);
}

export function readMat3(view: DataView, offset: number | undefined, littleEndian?: boolean): mat4 | null {
    if (offset === undefined)
        return null;

    const m00 = view.getFloat32(offset + 0x00, littleEndian);
    const m01 = view.getFloat32(offset + 0x04, littleEndian);
    const m02 = view.getFloat32(offset + 0x08, littleEndian);
    const m03 = view.getFloat32(offset + 0x0C, littleEndian);

    const m10 = view.getFloat32(offset + 0x10, littleEndian);
    const m11 = view.getFloat32(offset + 0x14, littleEndian);
    const m12 = view.getFloat32(offset + 0x18, littleEndian);
    const m13 = view.getFloat32(offset + 0x1C, littleEndian);

    const m20 = view.getFloat32(offset + 0x20, littleEndian);
    const m21 = view.getFloat32(offset + 0x24, littleEndian);
    const m22 = view.getFloat32(offset + 0x28, littleEndian);
    const m23 = view.getFloat32(offset + 0x2C, littleEndian);

    return mat4.fromValues(
        m00, m10, m20, 0,
        m01, m11, m21, 0,
        m02, m12, m22, 0,
        m03, m13, m23, 1,
    );
}

export function readMat4(view: DataView, offset: number | undefined, littleEndian?: boolean): mat4 | null {
    if (offset === undefined)
        return null;

    const m00 = view.getFloat32(offset + 0x00, littleEndian);
    const m01 = view.getFloat32(offset + 0x04, littleEndian);
    const m02 = view.getFloat32(offset + 0x08, littleEndian);
    const m03 = view.getFloat32(offset + 0x0C, littleEndian);

    const m10 = view.getFloat32(offset + 0x10, littleEndian);
    const m11 = view.getFloat32(offset + 0x14, littleEndian);
    const m12 = view.getFloat32(offset + 0x18, littleEndian);
    const m13 = view.getFloat32(offset + 0x1C, littleEndian);

    const m20 = view.getFloat32(offset + 0x20, littleEndian);
    const m21 = view.getFloat32(offset + 0x24, littleEndian);
    const m22 = view.getFloat32(offset + 0x28, littleEndian);
    const m23 = view.getFloat32(offset + 0x2C, littleEndian);

    const m30 = view.getFloat32(offset + 0x30, littleEndian);
    const m31 = view.getFloat32(offset + 0x34, littleEndian);
    const m32 = view.getFloat32(offset + 0x38, littleEndian);
    const m33 = view.getFloat32(offset + 0x3C, littleEndian);

    /*return mat4.fromValues(
        m00, m10, m20, m30,
        m01, m11, m21, m31,
        m02, m12, m22, m32,
        m03, m13, m23, m33,
    );*/

    return mat4.fromValues(
        m00, m01, m02, m03,
        m10, m11, m12, m13,
        m20, m21, m22, m23,
        m30, m31, m32, m33,
    );
}

export interface TRB_Joint {
    name: string;
    parent_index: number;
    unknown0: vec4;
    unknown1: mat4;
    unknown2: mat4;
    unknown3: vec4;
}

export function TRB_LoadJoint(ctx: TRB_LoadContext, offset: number): TRB_Joint {
    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const unknown0 = readVec4(view, offset + 0x00, littleEndian)!;
    const unknown1 = readMat4(view, offset + 0x10, littleEndian)!;
    const unknown2 = readMat4(view, offset + 0x50, littleEndian)!;
    const unknown3 = readVec4(view, offset + 0x90, littleEndian)!;
    const name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0xA0)!;
    const parent_index = view.getInt16(offset + 0xA4, littleEndian);

    return { name, parent_index, unknown0, unknown1, unknown2, unknown3 };
}

export interface TRB_Collision {
}

export function TRB_LoadCollision(ctx: TRB_LoadContext, offset: number | undefined): TRB_Collision {
    return {};
}

export interface TRB_SkeletonHeader {
}

export function TRB_LoadSkeletonHeader(ctx: TRB_LoadContext, offset: number | undefined): TRB_SkeletonHeader {
    return {};
}

export interface TRB_Skeleton {
    name: string | null;
    bounding_sphere: vec4;
    joints: TRB_Joint[];
}

export function TRB_LoadSkeleton(ctx: TRB_LoadContext, offset: number | undefined): TRB_Skeleton | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const view = ctx.view;
    const name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x38);
    const bounding_sphere = readVec4(view, offset + 0x00)!;
    const count = view.getUint16(offset + 0x10, littleEndian);
    const joints = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x18), count, 0xB0, TRB_LoadJoint);

    return { name, bounding_sphere, joints };
}

export interface TRB_JointWeights {
    joint_indices: Uint8Array;
    joint_weights: vec3;
}

export interface TRB_DisplayList {
    data_offset?: number;
    data_size: number;
    matrix_indices?: Uint8Array;
    stride: number;
    index_count: number;
}

function TRB_MeshInfo_processAttributes(ctx: TRB_LoadContext, mesh: TRB_TCMD_MeshInfo) {
    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const vatFormat: GX_VtxAttrFmt[] = [];
    const vcd: GX_VtxDesc[] = [];
    const arrays: GX_Array[] = [];

    const format_info = mesh.format_info;
    const attribute_info = mesh.attributes;

    if (attribute_info) {
        for (let attribute_index = 0; attribute_index < attribute_info.length; ++attribute_index) {
            let attribute = attribute_info[attribute_index].attribute;
            const data_offset = attribute_info[attribute_index].data_offset;
            const stride = attribute_info[attribute_index].stride;

            if (attribute === GX.Attr._NBT)
                attribute = GX.Attr.NRM;

            if (!data_offset)
                continue;

            arrays[attribute] = { buffer: buffer, offs: data_offset, stride };
        }
    }

    if (format_info) {
        for (let format_index = 0; format_index < format_info?.length; ++ format_index) {
            const format = format_info[format_index];
            let attribute = format.attr;
            const compShift = format.shift;
            const type = format.attrType;
            const compCnt = format.compCnt;
            const compType = format.compType;

            if (attribute === GX.Attr._NBT)
                attribute = GX.Attr.NRM;

            vcd[attribute] = { type };
            vatFormat[attribute] = { compType, compCnt, compShift };
        }
    }

    return { vatFormat, vcd, arrays };
}

function runVertices(ctx: TRB_LoadContext, mesh: TRB_TCMD_MeshInfo, index: number, attribute_sizes: number[]) {
    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const { vatFormat, vcd, arrays } = TRB_MeshInfo_processAttributes(ctx, mesh);
    const dlBuffer = buffer.subarray(mesh.display_lists[index].data_offset!, mesh.display_lists[index].data_size)

    const loader = compileVtxLoader(vatFormat, vcd);
    const loadedVertexLayout = loader.loadedVertexLayout;
    const loadedVertexData = loader.runVertices(arrays, dlBuffer);
    return { loadedVertexLayout, loadedVertexData };
}

export interface TRB_TCMD_Attribute {
    data_offset: number | undefined;
    attribute: number;
    stride: number;
    count: number;
}

export function TRB_TCMD_LoadJointWeights(ctx: TRB_LoadContext, offset: number | undefined): TRB_JointWeights | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const joint_indices = buffer.createTypedArray(Uint8Array, offset + 0x00, 4);
    const weight_values = buffer.createTypedArray(Uint8Array, offset + 0x04, 3);
    const joint_weights = vec3.fromValues(weight_values[0], weight_values[1], weight_values[2]);
    vec3.normalize(joint_weights, joint_weights);

    const weight_info: TRB_JointWeights = {joint_indices, joint_weights};

    return weight_info;
}

export function TRB_TCMD_LoadAttribute(ctx: TRB_LoadContext, offset: number | undefined): TRB_TCMD_Attribute | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const data_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x00);
    const attribute = view.getUint8(offset + 0x04);
    const stride = view.getUint8(offset + 0x05);
    const count = view.getUint16(offset + 0x06, littleEndian);

    const attribute_info: TRB_TCMD_Attribute = {data_offset, attribute, stride, count};

    return attribute_info;
}

export function TRB_TCMD_LoadDisplayList(ctx: TRB_LoadContext, offset: number | undefined): TRB_DisplayList | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const stride = view.getUint8(offset + 0x00);
    const index_count = view.getUint8(offset + 0x01);
    const data_size = view.getUint32(offset + 0x0C, littleEndian);
    const data_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x10);
    const matrix_indices = buffer.createTypedArray(Uint8Array, offset + 0x02, 10);

    const display_list: TRB_DisplayList = {data_offset, data_size, matrix_indices, stride, index_count};

    return display_list;
}

export interface TRB_TCMD_FormatInfo {
    attr: GX.Attr;
    attrType: GX.AttrType;
    vtxFmt: GX.VtxFmt;
    compCnt: GX.CompCnt;
    compType: GX.CompType;
    shift: number;
}

export function TRB_TCMD_LoadFormatInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_TCMD_FormatInfo[] | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const count = view.getUint32(offset + 0x00, littleEndian);
    const format_info: TRB_TCMD_FormatInfo[] = [];

    let format_offset = offset + 0x04;
    for (let format_index = 0; format_index < count; ++format_index) {
        const format = view.getUint16(format_offset + 0x00, littleEndian);
        const shift = view.getUint8(format_offset + 0x02);
        const attr: GX.Attr = view.getUint8(format_offset + 0x03);

        const vtxFmt: GX.VtxFmt = (format >> 0x00) & 0x03;
        const attrType: GX.AttrType = (format >> 0x03) & 0x03;
        const compCnt: GX.CompCnt = (format >> 0x06) & 0x03;
        const compType: GX.CompType = (format >> 0x09) & 0x03;

        format_info.push({attr, attrType, vtxFmt, compCnt, compType, shift});
        format_offset += 4;
    }

    return format_info;
}

export interface TRB_TCMD_MeshInfo {
    display_lists: TRB_DisplayList[];
    format_info: TRB_TCMD_FormatInfo[] | null;
    attributes: TRB_TCMD_Attribute[] | null;
    joint_weights: TRB_JointWeights[];
    mesh_data: TRB_TMeshData[];
    attributes_valid: boolean;
}

export function TRB_TCMD_LoadMesh(ctx: TRB_LoadContext, offset: number | undefined): TRB_TCMD_MeshInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const format_info_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x04);
    const display_list_count = view.getUint32(offset + 0x08, littleEndian);
    const display_list_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x0C);
    const attribute_count = view.getUint32(offset + 0x10, littleEndian);
    const attribute_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x14);
    const joint_weights_info_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x18);
    let joint_weights: TRB_JointWeights[] = [];

    let format_info = TRB_TCMD_LoadFormatInfo(ctx, format_info_offset);
    const display_lists = TRB_LoadStructArray(ctx, display_list_offset, display_list_count, 0x14, TRB_TCMD_LoadDisplayList);
    const attributes = TRB_LoadStructArray(ctx, attribute_offset, attribute_count, 0x08, TRB_TCMD_LoadAttribute);
    const mesh_data: TRB_TMeshData[] = [];

    if (joint_weights_info_offset) {
        const joint_weights_offset = TRB_LoadContext__ResolvePtr(ctx, joint_weights_info_offset + 0x00);
        const joint_weights_count = view.getUint16(joint_weights_info_offset + 0x04, littleEndian);

        joint_weights = TRB_LoadStructArray(ctx, joint_weights_offset, joint_weights_count, 0x07, TRB_TCMD_LoadJointWeights);
    }

    for (let display_list_index = 0; display_list_index < display_list_count; ++display_list_index) {
        if (display_lists[display_list_index].stride != attributes.length) {
            //console.warn("Display list size not consistent with attribute count.");
        }
    }

    let attributes_valid = true;
    const mesh_info: TRB_TCMD_MeshInfo = {display_lists, format_info, attributes, joint_weights, mesh_data, attributes_valid};

    for (let i = 0; i < attributes.length; ++i) {
        mesh_info.attributes_valid = mesh_info.attributes_valid && attributes[i].data_offset !== undefined;
    }

    if (!mesh_info.attributes_valid)
        return mesh_info;

    const attribute_sizes: number[] = [];
    for (let i = 0; i < display_lists.length; ++i) {
        const attribute_sizes: number[] = [];
        mesh_data.push(runVertices(ctx, mesh_info, i, attribute_sizes));
    }

    return mesh_info;
}

export function TRB_TCMD_LoadModel(ctx: TRB_LoadContext, symbol_type: string, symbol_name: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x1C)!;
    const bounding_sphere = readVec4(view, offset + 0x00);
    const mesh_info = TRB_LoadOffsetToStructPointerArray(ctx, offset + 0x10, TRB_TCMD_LoadMesh);

    const collision = null; //TRB_LoadCollision(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x08));
    const skeleton = TRB_LoadSkeleton(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x2C));

    const mesh_resource: TRB_TMeshResource = { name, type: symbol_type, collision, skeleton, mesh_info, bounding_sphere };

    TRB_LoadContext__RegisterMeshResource(ctx, mesh_resource);

    return mesh_resource;
}

export interface TRB_TerrainResource extends TRB_TResource {
    cell_info: TRB_TDAT_CellInfo[];
    transform: mat4 | null;
    unknown0: vec4 | null;
    unknown1: vec4 | null;
}

export interface TRB_TDAT_MeshInstance {
    instance_name_0: string | null;
    instance_name_1: string | null;
    instance_name_2: string | null;
    instance_name_3: string | null;
    instance_name_4: string | null;

    transform: mat4 | null;
    unknown0: vec4 | null;
    unknown1: vec4 | null;
}

export function TRB_TDAT_LoadMeshInstance(ctx: TRB_LoadContext, offset: number | undefined): TRB_TDAT_MeshInstance | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const instance_name_0 = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x68);
    const instance_name_1 = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x6C);
    const instance_name_2 = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x74);
    const instance_name_3 = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x78);
    const instance_name_4 = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x80);

    const transform = readMat4(view, offset + 0x00, littleEndian);
    const unknown0 = readVec4(view, offset + 0x40, littleEndian);
    const unknown1 = readVec4(view, offset + 0x50, littleEndian);

    const mesh_instance: TRB_TDAT_MeshInstance = {instance_name_0, instance_name_1, instance_name_2, instance_name_3, instance_name_4, transform, unknown0, unknown1};

    return mesh_instance;
}

export interface TRB_TDAT_CellInstance {
    instance_name: string | null;
    unknown0: vec4 | null;
    unknown1: vec4 | null;
}

export function TRB_TDAT_LoadCellInstance(ctx: TRB_LoadContext, offset: number | undefined): TRB_TDAT_CellInstance | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const instance_name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x20);

    const unknown0 = readVec4(view, offset + 0x00, littleEndian);
    const unknown1 = readVec4(view, offset + 0x10, littleEndian);

    const cell_instance: TRB_TDAT_CellInstance = {instance_name, unknown0, unknown1};

    return cell_instance;
}

export interface TRB_TDAT_CellInfo {
    cell_path: string | null;
    cell_name: string | null;
    cell_instances: TRB_TDAT_CellInstance[];
    mesh_instances: TRB_TDAT_MeshInstance[];
    transform: mat4 | null;
    unknown0: vec4 | null;
    unknown1: vec4 | null;
}

export function TRB_TDAT_LoadCellInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_TDAT_CellInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const transform = readMat4(view, offset + 0x00, littleEndian);
    const unknown0 = readVec4(view, offset + 0x40, littleEndian);
    const unknown1 = readVec4(view, offset + 0x50, littleEndian);

    const cell_path = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x60);
    const cell_name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x64);

    const cell_instance_count = view.getUint32(offset + 0x6C, littleEndian);
    const cell_instance_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x68);
    const mesh_instance_count = view.getUint32(offset + 0x78, littleEndian);
    const mesh_instance_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x7C);

    const cell_instances = TRB_LoadStructArray(ctx, cell_instance_offset, cell_instance_count, 0x40, TRB_TDAT_LoadCellInstance);
    const mesh_instances = TRB_LoadStructArray(ctx, mesh_instance_offset, mesh_instance_count, 0xA0, TRB_TDAT_LoadMeshInstance);

    const cell_info: TRB_TDAT_CellInfo = {cell_path, cell_name, cell_instances, mesh_instances, transform, unknown0, unknown1};

    return cell_info;
}

export function TRB_TDAT_LoadData(ctx: TRB_LoadContext, symbol_type: string, symbol_name: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const transform = readMat4(view, offset + 0x00, littleEndian);
    const unknown0 = readVec4(view, offset + 0x40, littleEndian);
    const unknown1 = readVec4(view, offset + 0x50, littleEndian);

    const name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x60)!;

    const cell_info_count = view.getUint32(offset + 0x70, littleEndian);
    const cell_info_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x68);
    const cell_info = TRB_LoadStructArray(ctx, cell_info_offset, cell_info_count, 0xA0, TRB_TDAT_LoadCellInfo);

    const terrain_resource: TRB_TerrainResource = {name, type: symbol_type, cell_info, transform, unknown0, unknown1};

    TRB_LoadContext__RegisterTerrainResource(ctx, terrain_resource);

    return terrain_resource;
}

export interface TRB_TextureResource extends TRB_TResource {
    hash: number;
    hashes: Uint32Array;
    image_format: GX.TexFormat;
    palette_format: GX.TexPalette;
    image_data: ArrayBufferSlice;
    palette_data: ArrayBufferSlice;
    width: number;
    height: number;
    mipmap_count: number;
}

export function TRB_TextureData_Load(ctx: TRB_LoadContext, symbol_type: string, symbol_name: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;
    const endianness: Endianness = littleEndian ? Endianness.LITTLE_ENDIAN : Endianness.BIG_ENDIAN;

    const name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x04)!;
    const hash = view.getUint32(offset + 0x08, littleEndian);
    const hashes = buffer.createTypedArray(Uint32Array, offset + 0x08, 11, endianness);
    const image_format: GX.TexFormat = view.getUint32(offset + 0x38, littleEndian);
    const palette_format = view.getUint32(offset + 0x3C, littleEndian);

    const image_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x44)!;
    const palette_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x4C) ?? 0;

    const width = view.getUint16(offset + 0x78, littleEndian);
    const height = view.getUint16(offset + 0x7A, littleEndian);

    const mipmap_count = view.getUint8(offset + 0x80) + 1;

    const image_size = view.getUint32(offset + 0x54, littleEndian);
    const calculated_size = calcTextureSize(image_format, width, height);
    const has_palette = image_format == GX.TexFormat.C4 || image_format == GX.TexFormat.C8 || image_format == GX.TexFormat.C14X2;
    const palette_size = has_palette ? calcPaletteSize(image_format, palette_format) : 0;

    const image_data = buffer.subarray(image_offset, image_size);
    const palette_data = buffer.subarray(palette_offset, palette_size);

    const texture_resource: TRB_TextureResource = {name, type: symbol_type, hash, hashes, image_format, palette_format, image_data, palette_data, width, height, mipmap_count};

    TRB_LoadContext__RegisterTextureResource(ctx, texture_resource);

    return texture_resource;
}

export interface TRB_MaterialResource extends TRB_TResource {
    hash: number;
    texture_names: string[];
}

export function TRB_MaterialData_Load(ctx: TRB_LoadContext, symbol_type: string, symbol_name: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;
    const endianness: Endianness = littleEndian ? Endianness.LITTLE_ENDIAN : Endianness.BIG_ENDIAN;

    const name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x08)!;
    const hash = view.getUint32(offset + 0x0C, littleEndian);
    const texture_count = view.getUint32(offset + 0x10, littleEndian);
    const texture_names: string[] = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x14), texture_count, 0x08, (c, o) => TRB_LoadContext__ResolvePtrString(c, o! + 4));

    const material_resource: TRB_MaterialResource = {name, type: symbol_type, hash, texture_names};

    TRB_LoadContext__RegisterMaterialResource(ctx, material_resource);

    return material_resource;
}

export interface TRB_EntityProperty {
    name: string;
    data_type: number;
    data_value: number | string | boolean | null;
}

export interface TRB_EntityInfo {
    type: string;
    transform: mat4 | null;
    properties: Map<string, TRB_EntityProperty>;
}

export interface TRB_EntityResource extends TRB_TResource {
    entity_info: TRB_EntityInfo[];
}

export function TRB_Entity_LoadEntityProperty(ctx: TRB_LoadContext, offset: number | undefined): TRB_EntityProperty | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x00)!;
    const data_type = view.getUint32(offset + 0x04, littleEndian);
    let data_value: number | string | boolean | null;

    switch (data_type) {
        case 0: data_value = view.getUint32(offset + 0x08, littleEndian); break;
        case 1: data_value = view.getFloat32(offset + 0x08, littleEndian); break;
        case 2: data_value = view.getUint32(offset + 0x08, littleEndian) != 0; break;
        case 3: data_value = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x08); break;
        default: data_value = TRB_LoadContext__ResolvePtr(ctx, offset + 0x08) ?? null; break;
    }

    const property: TRB_EntityProperty = {name, data_type, data_value};

    return property;
}

export function TRB_Entity_LoadEntityInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_EntityInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const type = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x00)!;
    const transform = readMat4(view, TRB_LoadContext__ResolvePtr(ctx, offset + 0x0C), littleEndian);

    const property_count = view.getUint32(offset + 0x04, littleEndian);

    const properties: Map<string, TRB_EntityProperty> = new Map();
    const property_info = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x08), property_count, 0x0C, (c, o) => {
        const property = TRB_Entity_LoadEntityProperty(c, o)!;

        properties.set(property.name, property);

        return property;
    });

    const entity_info: TRB_EntityInfo = {type, transform, properties};

    return entity_info;
}

export function TRB_EntityData_Load(ctx: TRB_LoadContext, symbol_type: string, symbol_name: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;
    const endianness: Endianness = littleEndian ? Endianness.LITTLE_ENDIAN : Endianness.BIG_ENDIAN;

    const entity_count = view.getUint32(offset + 0x04, littleEndian);

    const entity_info = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x00), entity_count, 0x28, TRB_Entity_LoadEntityInfo);

    const entity_resource: TRB_EntityResource = {name: "", type: symbol_type, entity_info};

    TRB_LoadContext__RegisterEntityResource(ctx, entity_resource);

    return entity_resource;
}

const resource_handlers: Map<string, (ctx: TRB_LoadContext, symbol_type: string, symbol_name: string, offset: number | undefined) => TRB_TResource | null> = new Map([
    ["tcmd", TRB_TCMD_LoadModel],
    ["dmct", TRB_TCMD_LoadModel],
    ["ttex", TRB_TextureData_Load],
    ["xett", TRB_TextureData_Load],
    ["tmat", TRB_MaterialData_Load],
    ["tamt", TRB_MaterialData_Load],
    ["tdat", TRB_TDAT_LoadData],
    ["tadt", TRB_TDAT_LoadData],
    ["EntitiesMain", TRB_EntityData_Load],
]);
