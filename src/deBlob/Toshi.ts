import ArrayBufferSlice from "../ArrayBufferSlice";
import { readString, assert, flatten } from "../util";
import { vec3, mat4, vec4 } from "gl-matrix";
import * as GX from "../gx/gx_enum";
import { compileVtxLoader, GX_VtxAttrFmt, GX_VtxDesc, LoadedVertexData, GX_Array, LoadedVertexLayout } from "../gx/gx_displaylist";
import { Color, colorNewCopy, TransparentBlack, colorFromRGBA8, colorNewFromRGBA8 } from "../Color";
import { calcPaletteSize, calcTextureSize } from "../gx/gx_texture";
import { Endianness } from "../endian";

export interface TRB_ArchiveSection {
    unknown0: number;
    unknown1: number;
    section_size: number;
    unknown2: number;
    unknown3: number;
}

export interface TRB_ArchiveRelocation {
    sourceIndex: number;
    targetIndex: number;
    sourceOffset: number;
}

export interface TRB_ArchiveSymbol {
    name: string;
    sectionIndex: number;
    offset: number;
}

export interface TRB_ArchiveDataBlock {
    magic: number;
    dataSize: number;
    dataBuffer: ArrayBufferSlice;
    littleEndian?: boolean;
}

export interface TRB_Archive {
    fileBlock: TRB_ArchiveDataBlock;

    hdrxBlock: HDRX_DataBlock;
    sectBlock: SECT_DataBlock;
    relcBlock: RELC_DataBlock;
    symbBlock: SYMB_DataBlock;

    source_offsets: number[];
    target_offsets: number[];
    relocation_mappings: Map<number, number>;

    symbol_offsets: number[];
}

export interface RelocationMapping {

}


export function TRB_Archive_ParseDataBlock(buffer: ArrayBufferSlice, littleEndian?: boolean | undefined): TRB_ArchiveDataBlock {
    const view = buffer.createDataView();

    const magic = view.getUint32(0x00);
    const dataSize = view.getUint32(0x04, littleEndian);
    const dataBuffer = buffer.subarray(0x08, dataSize);

    return { magic, dataSize, dataBuffer, littleEndian };
}

export function TRB_ArchiveParse(buffer: ArrayBufferSlice): TRB_Archive {
    let endian_value = buffer.createTypedArray(Uint8Array, 3, 1);
    let littleEndian = endian_value[0] == 'L'.charCodeAt(0);
    let fileBlock = TRB_Archive_ParseDataBlock(buffer, littleEndian);
    let dataBuffer = fileBlock.dataBuffer.slice(0x04);

    let hdrxBlock = HDRX_ParseDataBlock(dataBuffer, littleEndian);
    dataBuffer = buffer.slice(hdrxBlock.dataBuffer.byteOffset + hdrxBlock.dataBuffer.byteLength);

    let sectBlock = SECT_ParseDataBlock(dataBuffer, littleEndian);
    dataBuffer = buffer.slice(sectBlock.dataBuffer.byteOffset + sectBlock.dataBuffer.byteLength);

    let relcBlock = RELC_ParseDataBlock(dataBuffer, littleEndian);
    dataBuffer = buffer.slice(relcBlock.dataBuffer.byteOffset + relcBlock.dataBuffer.byteLength);

    let symbBlock = SYMB_ParseDataBlock(dataBuffer, littleEndian);
    dataBuffer = buffer.slice(symbBlock.dataBuffer.byteOffset + symbBlock.dataBuffer.byteLength);

    // calculate section offsets
    const section_count = hdrxBlock.section_count;
    const section_info = hdrxBlock.section_info;
    const section_offsets: number[] = [0];
    for (let i = 1; i < section_count; ++i) {
        section_offsets[i] = section_offsets[i - 1] + section_info[i - 1].section_size;
    }

    // calculate relocation source and target offsets
    const relocation_count = relcBlock.relocation_count;
    const relocation_info = relcBlock.relocation_info;
    const section_view = sectBlock.dataBuffer.createDataView();
    const source_offsets: number[] = [];
    const target_offsets: number[] = [];
    const relocation_mappings = new Map<number, number>();
    for (let i = 0; i < relocation_count; ++i) {
        const source_index = relocation_info[i].sourceIndex;
        const target_index = relocation_info[i].targetIndex;
        const source_offset = relocation_info[i].sourceOffset + section_offsets[source_index];
        const target_offset = section_view.getUint32(source_offset, littleEndian) + section_offsets[target_index];

        source_offsets.push(source_offset);
        target_offsets.push(target_offset);
        relocation_mappings.set(source_offset, i);
    }

    // calculate symbol offsets
    const symbol_count = symbBlock.symbol_count;
    const symbol_info = symbBlock.symbol_info;
    const symbol_offsets: number[] = [];
    for (let i = 0; i < symbol_count; ++i) {
        const section_index = symbol_info[i].sectionIndex;
        const section_offset = symbol_info[i].offset;

        symbol_offsets.push(section_offsets[section_index] + section_offset);
    }

    return { fileBlock, hdrxBlock, sectBlock, relcBlock, symbBlock, source_offsets, target_offsets, relocation_mappings, symbol_offsets };
}

export function TRB_LoadContext__ProcessSymbolResources(ctx: TRB_LoadContext): TRB_TResource[] {
    const archive = ctx.archive;
    const symbol_block = archive.symbBlock;

    // calculate symbol offsets
    const symbol_count = symbol_block.symbol_count;
    const symbol_info = symbol_block.symbol_info;
    const symbol_offsets = archive.symbol_offsets;
    const symbol_resources: TRB_TResource[] = [];
    for (let i = 0; i < symbol_count; ++i) {
        const symbol_type = symbol_info[i].name;
        const lookup_type = symbol_type.startsWith("UV") ? "UV" : symbol_type;
        const symbol_handler = resource_handlers.get(lookup_type);
        if (!symbol_handler)
            continue;

        const symbol_resource = symbol_handler(ctx, symbol_type, symbol_offsets[i]);
        if (!symbol_resource)
            continue;

        symbol_resources.push(symbol_resource);
    }

    return symbol_resources;
}

export interface HDRX_DataBlock extends TRB_ArchiveDataBlock {
    unknown0: number;
    unknown1: number;
    section_count: number;
    section_info: TRB_ArchiveSection[];
}

export function HDRX_ParseDataBlock(buffer: ArrayBufferSlice, littleEndian?: boolean | undefined): HDRX_DataBlock {
    const { magic, dataSize, dataBuffer } = TRB_Archive_ParseDataBlock(buffer, littleEndian);
    const view = dataBuffer.createDataView();

    const unknown0 = view.getUint16(0x00, littleEndian);
    const unknown1 = view.getUint16(0x02, littleEndian);
    const section_count = view.getUint32(0x04, littleEndian);

    let base_offset = 0x08;

    const section_info: TRB_ArchiveSection[] = [];
    for (let i = 0; i < section_count; ++i) {
        const unknown0 = view.getUint16(base_offset + 0x00, littleEndian);
        const unknown1 = view.getUint16(base_offset + 0x02, littleEndian);
        const section_size = view.getUint32(base_offset + 0x04, littleEndian);
        const unknown2 = view.getUint32(base_offset + 0x08, littleEndian);
        const unknown3 = view.getUint16(base_offset + 0x0C, littleEndian);

        section_info.push({ unknown0, unknown1, section_size, unknown2, unknown3 })

        base_offset += 0x10;
    }

    return { magic, dataSize, dataBuffer, littleEndian, unknown0, unknown1, section_count, section_info };
}

export interface SECT_DataBlock extends TRB_ArchiveDataBlock {
}

export function SECT_ParseDataBlock(buffer: ArrayBufferSlice, littleEndian?: boolean | undefined): SECT_DataBlock {
    const { magic, dataSize, dataBuffer } = TRB_Archive_ParseDataBlock(buffer, littleEndian);
    const view = dataBuffer.createDataView();

    return { magic, dataSize, dataBuffer, littleEndian };
}

export interface RELC_DataBlock extends TRB_ArchiveDataBlock {
    relocation_count: number;
    relocation_info: TRB_ArchiveRelocation[];
}

export function RELC_ParseDataBlock(buffer: ArrayBufferSlice, littleEndian?: boolean | undefined): RELC_DataBlock {
    const { magic, dataSize, dataBuffer } = TRB_Archive_ParseDataBlock(buffer, littleEndian);
    const view = dataBuffer.createDataView();

    const relocation_count = view.getUint32(0x00, littleEndian);

    let base_offset = 0x04;

    const relocation_info: TRB_ArchiveRelocation[] = [];
    for (let i = 0; i < relocation_count; ++i) {
        const sourceIndex = view.getUint16(base_offset + 0x00, littleEndian);
        const targetIndex = view.getUint16(base_offset + 0x02, littleEndian);
        const sourceOffset = view.getUint32(base_offset + 0x04, littleEndian);

        relocation_info.push({ sourceIndex, targetIndex, sourceOffset });

        base_offset += 0x08;
    }

    return { magic, dataSize, dataBuffer, littleEndian, relocation_count, relocation_info };
}

export interface SYMB_DataBlock extends TRB_ArchiveDataBlock {
    symbol_count: number;
    symbol_info: TRB_ArchiveSymbol[];
}

export function SYMB_ParseDataBlock(buffer: ArrayBufferSlice, littleEndian?: boolean | undefined): SYMB_DataBlock {
    const { magic, dataSize, dataBuffer } = TRB_Archive_ParseDataBlock(buffer, littleEndian);
    const view = dataBuffer.createDataView();

    const symbol_count = view.getUint32(0x00, littleEndian);

    let base_offset = 0x04;
    const string_table_offset = base_offset + symbol_count * 0x0C;

    const symbol_info: TRB_ArchiveSymbol[] = [];
    for (let i = 0; i < symbol_count; ++i) {
        const sectionIndex = view.getUint16(base_offset + 0x00, littleEndian);
        const nameOffset = view.getUint16(base_offset + 0x02, littleEndian);
        const offset = view.getUint32(base_offset + 0x08, littleEndian);
        const name = readString(dataBuffer, string_table_offset + nameOffset);

        symbol_info.push({ name, sectionIndex, offset });

        base_offset += 0x0C;
    }

    return { magic, dataSize, dataBuffer, littleEndian, symbol_count, symbol_info };
}

export function TRB_Archive__ResolvePtr(arc: TRB_Archive, offs: number): number | undefined {
    // Ensure that this is somewhere within our relocation table.
    let offset_index = arc.relocation_mappings.get(offs);
    if (offset_index === undefined) {
        return undefined;
    }

    return arc.target_offsets[offset_index];
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
    uv_resources: Map<string, TRB_UVResource>;
    entity_resources: TRB_EntityResource[];

    constructor(public archive: TRB_Archive) {
        this.buffer = archive.sectBlock.dataBuffer;
        this.view = archive.sectBlock.dataBuffer.createDataView();
        this.littleEndian = archive.sectBlock.littleEndian;
        this.mesh_resources = new Map<string, TRB_TMeshResource>();
        this.terrain_resources = [];
        this.texture_resources = new Map<string, TRB_TextureResource>();
        this.material_resources = new Map<string, TRB_MaterialResource>();
        this.uv_resources = new Map<string, TRB_UVResource>();
        this.entity_resources = [];
    }
}

export function TRB_LoadContext__ResolvePtr(ctx: TRB_LoadContext, offs: number): number | undefined {
    return TRB_Archive__ResolvePtr(ctx.archive, offs);
}

export function TRB_LoadContext_GetDataView(ctx: TRB_LoadContext): DataView {
    const sect_block = ctx.archive.sectBlock;

    const littleEndian = sect_block.littleEndian;
    const buffer = sect_block.dataBuffer;
    const view = buffer.createDataView();

    return view;
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
    skeleton_header: TRB_SkeletonHeader | null;
    skeleton: TRB_Skeleton | null;
    lod_info: TRB_LodInfo[] | null;
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

export function TRB_LoadContext__RegisterUVResource(ctx: TRB_LoadContext, resource: TRB_UVResource) {
    ctx.uv_resources.set(resource.name.split(".")[0].toLowerCase(), resource);
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
}

export function TRB_LoadJoint(ctx: TRB_LoadContext, offset: number): TRB_Joint {
    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const unknown0 = readVec4(view, offset + 0x00, littleEndian)!;
    const unknown1 = readMat4(view, offset + 0x10, littleEndian)!;
    const unknown2 = readMat4(view, offset + 0x50, littleEndian)!;
    const name = readString(buffer, TRB_LoadContext__ResolvePtr(ctx, offset + 0x90)!);
    const parent_index = view.getInt16(offset + 0x94, littleEndian);

    return { name, parent_index, unknown0, unknown1, unknown2 };
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
    joints: TRB_Joint[];
}

export function TRB_LoadSkeleton(ctx: TRB_LoadContext, offset: number | undefined): TRB_Skeleton | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const view = ctx.view;
    const count = view.getUint16(offset + 0x00, littleEndian);
    const joints = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x34), count, 0xB0, TRB_LoadJoint);

    return { joints };
}

export interface TRB_JointWeights {
    joint_indices: Uint8Array;
    joint_weights: vec3;
}

function TRB_LoadJointWeights(ctx: TRB_LoadContext, offset: number | undefined): TRB_JointWeights | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const joint_indices = buffer.createTypedArray(Uint8Array, offset + 0x00, 4);
    const joint_weights = readVec3(view, offset + 0x04, littleEndian)!;

    return { joint_indices, joint_weights };
}

export interface TRB_DisplayList {
    data_offset?: number;
    data_size: number;
    matrix_indices?: Uint8Array;
}

function TMOD_ConvertAttributes(attributes: Uint8Array) {
    const results: Uint8Array = new Uint8Array(8);
    results[0] = attributes[0]; // position shift
    results[1] = (attributes[1] & 0x0F) | 0x80; // pos attribute type
    if ((attributes[1] & 0x80) == 0x00) {
        results[2] = attributes[2]; // nrm attribute type
    }
    else {
        // TODO: handle CLR values
        results[3] = (attributes[2] & 0x0F) | ((attributes[2] >> 3) & 0xF0); // clr0 attribute type
    }
    results[4] = attributes[3]; // tex0 attribute type

    return results;
}

function TRB_MeshInfo_processAttributes(ctx: TRB_LoadContext, mesh: TRB_MeshInfo) {
    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const vatFormat: GX_VtxAttrFmt[] = [];
    const vcd: GX_VtxDesc[] = [];
    const arrays: GX_Array[] = [];

    const attributes: Uint8Array = mesh.attributes;
    if (attributes.length < 4)
        return { vatFormat, vcd, arrays };

    const shift = attributes[0];

    let attrType = attributes[1] & 0x0F;
    vcd[GX.Attr.POS] = { type: attrType };
    vatFormat[GX.Attr.POS] = { compType: GX.CompType.S16, compCnt: GX.CompCnt.POS_XYZ, compShift: shift };
    arrays[GX.Attr.POS] = { buffer: buffer, offs: mesh.pos_offset!, stride: 6 };

    if (attributes[1] & 0x80) {
        vcd[GX.Attr.PNMTXIDX] = { type: GX.AttrType.DIRECT };
        vatFormat[GX.Attr.PNMTXIDX] = { compType: GX.CompType.U8, compCnt: 0, compShift: 0 };
    }

    vcd[GX.Attr.NRM] = { type: attributes[2] & 0x0F };
    vatFormat[GX.Attr.NRM] = { compType: GX.CompType.S8, compCnt: GX.CompCnt.NRM_XYZ, compShift: 6 };
    if (mesh.nrm_offset)
        arrays[GX.Attr.NRM] = { buffer: buffer, offs: mesh.nrm_offset, stride: 3 };

    // TODO: handle color attributes
    const colorCompCnts = [GX.CompCnt.CLR_RGB, GX.CompCnt.CLR_RGB, GX.CompCnt.CLR_RGBA];
    const colorCompTypes = [GX.CompType.RGB565, GX.CompType.RGBA4, GX.CompType.RGBA8];
    const colorCompStrides = [2, 2, 4];
    const colorAttr = (attributes[3] >> 4) & 0x03;
    vcd[GX.Attr.CLR0] = { type: attributes[3] & 0x0F };
    vatFormat[GX.Attr.CLR0] = { compType: colorCompTypes[colorAttr], compCnt: colorCompCnts[colorAttr], compShift: 0 };
    if (mesh.clr0_offset)
        arrays[GX.Attr.CLR0] = { buffer: buffer, offs: mesh.clr0_offset, stride: colorCompStrides[colorAttr] };

    vcd[GX.Attr.TEX0] = { type: attributes[4] & 0x0F };
    vatFormat[GX.Attr.TEX0] = { compType: GX.CompType.S16, compCnt: GX.CompCnt.TEX_ST, compShift: 8 };
    if (mesh.tex0_offset)
        arrays[GX.Attr.TEX0] = { buffer: buffer, offs: mesh.tex0_offset, stride: 4 };

    vcd[GX.Attr.TEX1] = { type: attributes[5] & 0x0F };
    vatFormat[GX.Attr.TEX1] = { compType: GX.CompType.S16, compCnt: GX.CompCnt.TEX_ST, compShift: 12 };
    if (mesh.tex1_offset)
        arrays[GX.Attr.TEX1] = { buffer: buffer, offs: mesh.tex1_offset, stride: 4 };

    return { vatFormat, vcd, arrays };
}

function runVertices(ctx: TRB_LoadContext, mesh: TRB_MeshInfo, index: number) {
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

export function TRB_LoadDisplayList(ctx: TRB_LoadContext, offset: number | undefined): TRB_DisplayList | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const data_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x00);
    const data_size = view.getUint32(offset + 0x04, littleEndian);

    const matrix_indices = buffer.createTypedArray(Uint8Array, offset + 0x0C, 10);

    return { data_offset, data_size, matrix_indices };
}

export interface TRB_MeshInfo {
    name: string;

    pos_count: number;
    pos_offset?: number;

    nrm_count: number;
    nrm_offset?: number;

    clr0_count: number;
    clr0_offset?: number;

    tex0_count: number;
    tex0_offset?: number;

    tex1_count: number;
    tex1_offset?: number;

    attributes: Uint8Array;

    display_lists: TRB_DisplayList[];
    joint_weights: TRB_JointWeights[];

    mesh_data: TRB_TMeshData[];
}

export function TRB_TMOD_LoadMeshInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_MeshInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;
    const pos_count = view.getUint32(offset + 0x00, littleEndian);
    let nrm_count = 0;
    let clr0_count = 0;
    const tex0_count = view.getUint32(offset + 0x08, littleEndian);
    const pos_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x0C);
    let nrm_offset = undefined;
    let clr0_offset = undefined;
    const tex0_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x14);
    const display_list_count = view.getUint32(offset + 0x1C, littleEndian);
    const display_lists = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x18), display_list_count, 0x18, TRB_LoadDisplayList);
    const name = readString(buffer, TRB_LoadContext__ResolvePtr(ctx, offset + 0x20)!);
    const raw_attributes = buffer.createTypedArray(Uint8Array, offset + 0x28, 4);
    const attributes = TMOD_ConvertAttributes(raw_attributes);
    const joint_weights = TRB_LoadOffsetToStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x24), 0x10, TRB_LoadJointWeights);
    const mesh_data: TRB_TMeshData[] = [];

    if ((raw_attributes[1] & 0x80) == 0x80)
    {
        clr0_count = view.getUint32(offset + 0x04, littleEndian);
        clr0_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x10);
    }
    else
    {
        nrm_count = view.getUint32(offset + 0x04, littleEndian);
        nrm_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x10);
    }

    const mesh_info: TRB_MeshInfo = {
        name,
        pos_count, pos_offset,
        nrm_count, nrm_offset,
        clr0_count, clr0_offset,
        tex0_count, tex0_offset,
        tex1_count: 0, tex1_offset: undefined,
        attributes, display_lists,
        joint_weights,
        mesh_data
    };

    for (let i = 0; i < display_lists.length; ++i) {
        mesh_data.push(runVertices(ctx, mesh_info, i));
    }

    return mesh_info;
}

export interface TRB_LodHeader {
    bounding_sphere: vec4;
}

export function TRB_LoadLodHeader(ctx: TRB_LoadContext, offset: number | undefined): TRB_LodHeader {
    //if (offset === undefined)
        return { bounding_sphere: vec4.fromValues(0, 0, 0, 0) };

    //const littleEndian = ctx.littleEndian;
    //const view = ctx.view;

    //return { bounding_sphere: readVec4(view, offset + 0x10, littleEndian)! };
}

export interface TRB_LodInfo {
    header: TRB_LodHeader;
    mesh_info: TRB_MeshInfo[];
}

export function TRB_LoadLodInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_LodInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const view = ctx.view;
    const count = view.getUint32(offset + 0x08, littleEndian);
    const header: TRB_LodHeader = TRB_LoadLodHeader(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x00));
    const mesh_info = TRB_LoadPointerArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x04), count, TRB_TMOD_LoadMeshInfo);

    return { header, mesh_info };
}

export interface TRB_TMOD extends TRB_TResource {
    name: string;
    collision: TRB_Collision | null;
    skeleton_header: TRB_SkeletonHeader | null;
    skeleton: TRB_Skeleton | null;
    lod_info: TRB_LodInfo[] | null;

    unknown1: number;
}

export function TRB_TMOD_LoadModel(ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const name = readString(buffer, TRB_LoadContext__ResolvePtr(ctx, offset + 0x00)!);
    const lod_info_count = view.getUint32(offset + 0x04, littleEndian);
    const unknown1 = view.getFloat32(offset + 0x08, littleEndian);
    const skeleton_header = TRB_LoadSkeletonHeader(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x0C));
    const skeleton = TRB_LoadSkeleton(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x10));
    const collision = TRB_LoadCollision(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x14));
    const lod_info = TRB_LoadPointerArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x18), lod_info_count, TRB_LoadLodInfo);

    const mesh_resource: TRB_TMeshResource = { name, type: symbol_type, collision, skeleton_header, skeleton, lod_info };

    TRB_LoadContext__RegisterMeshResource(ctx, mesh_resource);

    return mesh_resource;
}

function TRB_LoadSubMeshData(ctx: TRB_LoadContext, offset: number | undefined): TRB_MeshInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const pos_count = view.getUint32(offset + 0x14, littleEndian);
    const nrm_count = 0;
    const clr0_count = 0;
    const tex0_count = 0;
    const tex1_count = 0;
    const pos_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x18);
    const nrm_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x1C);
    const tex0_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x20);
    const clr0_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x24);
    const tex1_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x28);

    const display_list_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x2C);
    const display_list_size = view.getUint32(offset + 0x30, littleEndian);
    const matrix_indices = Uint8Array.from([0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
    const display_lists: TRB_DisplayList[] = [{ data_offset: display_list_offset, data_size: display_list_size, matrix_indices }];

    const name = readString(buffer, TRB_LoadContext__ResolvePtr(ctx, offset + 0x34)!);
    const attributes = buffer.createTypedArray(Uint8Array, offset + 0x3C, 8);
    const mesh_data: TRB_TMeshData[] = [];

    const mesh_info: TRB_MeshInfo = {
        name,
        pos_count, pos_offset,
        nrm_count, nrm_offset,
        clr0_count, clr0_offset,
        tex0_count, tex0_offset,
        tex1_count, tex1_offset,
        attributes, display_lists,
        joint_weights: [],
        mesh_data
    };

    try {
        for (let i = 0; i < display_lists.length; ++i) {
            mesh_data.push(runVertices(ctx, mesh_info, i));
        }
    } catch (error) {
        console.error(error);
    }

    return mesh_info;
}

function TRB_LoadSubMeshInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_LodInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const header: TRB_LodHeader = { bounding_sphere: readVec4(view, offset + 0x00, littleEndian)! };
    const mesh_info: TRB_MeshInfo[] = [TRB_LoadSubMeshData(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x10))!];

    return { header, mesh_info };
}

function TRB_LoadMeshGroup(ctx: TRB_LoadContext, offset: number | undefined): TRB_LodInfo[] | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    return TRB_LoadOffsetToStructPointerArray(ctx, offset + 0x84, TRB_LoadSubMeshInfo);
}

export interface TRB_TWLD extends TRB_TResource {
    name: string;
    collision: TRB_Collision;
    skeleton_header: TRB_SkeletonHeader;
    skeleton: TRB_SkeletonHeader;
    lod_info: TRB_LodInfo[];
}

export function TRB_TWLD_LoadModel(ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const name = readString(buffer, TRB_LoadContext__ResolvePtr(ctx, offset + 0x00)!);
    const mesh_groups = TRB_LoadOffsetToPointerArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x04),
        (c, o) => TRB_LoadOffsetToStructPointerArray(c, o, TRB_LoadMeshGroup));
    const lod_info = flatten(flatten(mesh_groups));

    const collision = TRB_LoadCollision(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x08));
    const skeleton_header = TRB_LoadSkeletonHeader(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x0C));
    const skeleton = TRB_LoadSkeleton(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x10));

    const mesh_resource: TRB_TMeshResource = { name, type: symbol_type, collision, skeleton_header, skeleton, lod_info };

    TRB_LoadContext__RegisterMeshResource(ctx, mesh_resource);

    return mesh_resource;
}

export interface TRB_Terrain_InstanceInfo {
    instance_name: string | null;
    resource_name: string | null;
    uv_name: string | null;

    transform: mat4 | null;
    position: vec3 | null;
}

export interface TRB_Terrain_CellInfo {
    cell_name: string | null;
    cell_path: string | null;

    transform: mat4 | null;
    position: vec3 | null;
    position2: vec3 | null;

    instance_info: TRB_Terrain_InstanceInfo[];
}

export interface TRB_Terrain_Info {
    cell_info: TRB_Terrain_CellInfo[];
}

export interface TRB_TerrainResource extends TRB_TResource {
    terrain_info: TRB_Terrain_Info[];
}

export function TRB_Terrain_LoadInstanceInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_Terrain_InstanceInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const instance_name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x08);
    const resource_name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x0C);
    const uv_name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x20);

    const transform = readMat4(view, TRB_LoadContext__ResolvePtr(ctx, offset + 0x00));
    const position_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x10);
    const position = position_offset ? readVec3(view, TRB_LoadContext__ResolvePtr(ctx, position_offset + 0x00)) : null;

    return {instance_name, resource_name, uv_name, transform, position} as TRB_Terrain_InstanceInfo;
}

export function TRB_Terrain_LoadCellInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_Terrain_CellInfo | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const cell_name = TRB_LoadContext__ResolvePtrString(ctx, offset + 0x00);
    const path_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x10);
    const cell_path = path_offset ? TRB_LoadContext__ResolvePtrString(ctx, path_offset) : null;

    const transform = readMat4(view, TRB_LoadContext__ResolvePtr(ctx, offset + 0x1C));
    const position = readVec3(view, TRB_LoadContext__ResolvePtr(ctx, offset + 0x08));
    const position2 = readVec3(view, TRB_LoadContext__ResolvePtr(ctx, offset + 0x0C));

    const instance_count = view.getUint32(offset + 0x24, littleEndian);

    const instance_info = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x28), instance_count, 0x40, TRB_Terrain_LoadInstanceInfo);

    return {cell_name, cell_path, transform, position, position2, instance_info} as TRB_Terrain_CellInfo;
}

export function TRB_Terrain_LoadTerrainInfo(ctx: TRB_LoadContext, offset: number | undefined): TRB_Terrain_Info | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const cell_count = view.getUint32(offset + 0x08, littleEndian);

    const cell_info = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x00), cell_count, 0x3C, TRB_Terrain_LoadCellInfo);

    return {cell_info} as TRB_Terrain_Info;
}

export function TRB_TerrainData_Load(ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;

    const info_count = view.getUint32(offset + 0x04, littleEndian);

    const terrain_info = TRB_LoadStructArray(ctx, TRB_LoadContext__ResolvePtr(ctx, offset + 0x00), info_count, 0x4C, TRB_Terrain_LoadTerrainInfo);

    const terrain_resource: TRB_TerrainResource = {name: "", type: symbol_type, terrain_info};

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

export function TRB_TextureData_Load(ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined): TRB_TResource | null {
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
    const palette_offset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x4C)!;

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

export function TRB_MaterialData_Load(ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined): TRB_TResource | null {
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

export interface TRB_UVResource extends TRB_TResource {
    unknown0: vec3;
    unknown1: vec3;
    tex1_names: string[];
    mesh_info: TRB_MeshInfo[];
}

export function TRB_UVData_Load(ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined): TRB_TResource | null {
    if (offset === undefined)
        return null;

    const littleEndian = ctx.littleEndian;
    const buffer = ctx.buffer;
    const view = ctx.view;
    const endianness: Endianness = littleEndian ? Endianness.LITTLE_ENDIAN : Endianness.BIG_ENDIAN;

    const name = symbol_type;
    const type = "UV";
    const lod_info: TRB_LodInfo[] = [];

    const unknown0 = readVec3(view, offset + 0x08, littleEndian)!;
    const unknown1 = readVec3(view, offset + 0x14, littleEndian)!;
    const tex1_names: string[] = [];
    const mesh_infos: TRB_MeshInfo[] = [];

    const count = view.getUint32(offset + 0x00, littleEndian);
    let baseOffset = TRB_LoadContext__ResolvePtr(ctx, offset + 0x04)!;

    for (let i = 0; i < count; ++i) {
        const material_name = TRB_LoadContext__ResolvePtrString(ctx, baseOffset + 0x04)!;
        const tex1_name = TRB_LoadContext__ResolvePtrString(ctx, baseOffset + 0x08)!;
        const display_list_offset = TRB_LoadContext__ResolvePtr(ctx, baseOffset + 0x0C);
        const display_list_size = view.getUint32(baseOffset + 0x10, littleEndian);
        const tex1_offset = TRB_LoadContext__ResolvePtr(ctx, baseOffset + 0x00);
        const attributes = buffer.createTypedArray(Uint8Array, baseOffset + 0x14, 8, endianness);
        const mesh_data: TRB_TMeshData[] = [];

        const display_lists: TRB_DisplayList[] = [{ data_offset: display_list_offset, data_size: display_list_size, matrix_indices: undefined }];
        const mesh_info: TRB_MeshInfo = {
            name: material_name,
            pos_count: 0, pos_offset: undefined,
            nrm_count: 0, nrm_offset: undefined,
            clr0_count: 0, clr0_offset: undefined,
            tex0_count: 0, tex0_offset: undefined,
            tex1_count: 0, tex1_offset,
            attributes, display_lists,
            joint_weights: [],
            mesh_data
        };

        mesh_infos.push(mesh_info);
        tex1_names.push(tex1_name);

        baseOffset += 0x20;
    }

    const uv_resource: TRB_UVResource = {name, type, unknown0, unknown1, tex1_names, mesh_info: mesh_infos};

    const collision = null;
    const skeleton_header = null;
    const skeleton = null;

    const mesh_resource: TRB_TMeshResource = { name, type, collision, skeleton_header, skeleton, lod_info };

    TRB_LoadContext__RegisterUVResource(ctx, uv_resource);

    return uv_resource;
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

export function TRB_EntityData_Load(ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined): TRB_TResource | null {
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

const resource_handlers: Map<string, (ctx: TRB_LoadContext, symbol_type: string, offset: number | undefined) => TRB_TResource | null> = new Map([
    ["tmod", TRB_TMOD_LoadModel],
    ["twld", TRB_TWLD_LoadModel],
    ["ttex", TRB_TextureData_Load],
    ["tmat", TRB_MaterialData_Load],
    ["UV", TRB_UVData_Load],
    ["Terrain_Main", TRB_TerrainData_Load],
    ["EntitiesMain", TRB_EntityData_Load],
]);
