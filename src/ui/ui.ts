import * as Viewer from "..viewer";


import SimpleBar from 'simplebar';
import { animateScrollTo } from 'animated-scroll-to';
import { randInt, sample, shuffle } from './common/common';

import './style.scss';
import 'font-awesome/css/font-awesome.css';
import 'simplebar/dist/simplebar.css';

import temp from './common/temp';
import { turnRandomVector } from '../SuperMarioGalaxy/ActorUtil';

const bgColors = [
  "#63E7C2",
  "#FFA8E5",
  "#E4CCFE",
  "#FFFF9A",
  "#FFB600",
  "#80BDFE",
  "#304FFF",
];

export class NUI {
  public node: HTMLElement;

  private menuOpen = true;
  private menuExpanded = true;

  private title: HTMLElement;
  private menu: HTMLElement;
  private bar: HTMLElement;
  private placeholder: HTMLElement;

  private gridScroll: HTMLElement;
  private gridScrollbar: SimpleBar;
  private gridScrollbarNode: HTMLElement;

  private listScroll: HTMLElement;
  private listScrollbar: SimpleBar;

  private regionsList: HTMLElement;

  private menuBar: HTMLElement;
  private actions: HTMLElement;
  private menuTabs: HTMLElement;

  private selectedRegion: string;
  private selectedLocation: string;

  public loadLocation;

  private regionOrder;
  private locations;
  private regionMap;
  private locationMap;

  constructor(public viewer: Viewer.viewer) {
    this.node = document.createElement('div');
    this.node.innerHTML = temp;
  }

  public init() {
    // todo proper bindings here
    this.tempBindings();

    // this.node.parentElement?.addEventListener('click', () => this.toggleMenu());

    this.node.addEventListener('click', (e) => this.click(e), false);
    document.addEventListener('keydown', (e) => this.onKeydown(e));

    this.gridScrollbar = new SimpleBar(this.gridScroll, { autoHide: true });
    this.gridScrollbarNode = this.gridScrollbar.getScrollElement() as HTMLElement;

    this.listScrollbar = new SimpleBar(this.listScroll, { autoHide: true });
  }

  private click(e) {
    if (e.target !== e.currentTarget) {
      if (e.target.classList.contains('region')) {
        const region = e.target.dataset.region;
        if (region != this.selectedRegion) {
          document.querySelector('.region.active')?.classList.remove('active');
          this.selectedRegion = region;
          document.querySelector(`[data-region="${this.selectedRegion}"]`).classList.add('active');
          this.renderLocations();
        }
        return;
      }

      if(e.target.classList.contains('location')) {
          const locationId = e.target.dataset.location;
          if (locationId != this.selectedLocation) {
            document.querySelector('.location.active')?.classList.remove('active');
            this.selectedLocation = locationId;
            document.querySelector(`[data-location="${this.selectedLocation}"]`).classList.add('active');
            this.loadLocation(this.locationMap[this.selectedLocation]);
            this.placeholder.classList.remove('active');
          }
          return;
      }
    }
  }

  private tempBindings() {
    // temp bindings
    this.title = document.querySelector('.title') as HTMLElement;
    this.menu = document.querySelector('.sw-menu') as HTMLElement;
    this.placeholder = document.querySelector('.placeholder') as HTMLElement;

    this.listScroll = document.querySelector('.sw-list-scroll') as HTMLElement;
    this.gridScroll = document.querySelector('.sw-grid-scroll') as HTMLElement;
    this.regionsList = document.querySelector('.sw-regions') as HTMLElement;

    this.menuBar = document.querySelector('.sw-bar') as HTMLElement;
    this.actions = document.querySelector('#actions') as HTMLElement;
    this.menuTabs = document.querySelector('#sw_tabs') as HTMLElement;

  }

  public toggleMenu(show = false) {
    if (this.menuOpen && !show) {
      // menu.classList.remove('scrollable');
      this.menu.classList.add('hidden');
      // setTimeout(() => {
      //     for (let i = 0; i < swBlocks.length; i++) {
      //         swBlocks[i].classList.remove('show');
      //     }
      // }, 100);
    } else {
      this.menu.classList.remove('hidden');

      // for (let i = 0; i < swBlocks.length; i++) {
      //     setTimeout(() => {
      //         swBlocks[i].classList.add('show');
      //     }, 200 + (swBlocks.length - i) * 20);
      //   }
    }
    this.menuBar.classList.toggle('hidden', this.menuOpen);
    this.menuTabs.classList.toggle('hidden', this.menuOpen);
    this.actions.classList.toggle('hidden', !this.menuOpen);
    this.menuOpen = !this.menuOpen;
  }

  private onKeydown(e: KeyboardEvent) {
    // console.log(e.keyCode);
    // if (e.keyCode == 86) {
    //   expandMenu();
    // }

    // if (e.keyCode == 86) {
    //   shuffle(rowTitles);
    //   debugAddItems(randInt(1, 14), 2, 6);
    // }

    if (e.keyCode == 67) {
      this.toggleMenu();
    }
  }

  // TODO: some game meta for non-search results is vital
  public setLocations(locations) {
    this.regionOrder = [];
    this.locations = locations;
    this.regionMap = {};
    this.locationMap = {};

    if(this.selectedRegion == null) {
      this.selectedRegion = 'all';
      // this.selectedRegion = locations[0].tag;
    }

    locations.forEach((location) => {
      if (!(location.tag in this.regionMap)) {
        this.regionOrder.push(location.tag);
        this.regionMap[location.tag] = [];
      }
      location.id = `${location.tag}|${location.title}`;
      this.locationMap[location.id] = location;
      this.regionMap[location.tag].push(location);
    });

    this.renderRegions();
    this.renderLocations();
  }

  private renderRegions() {
    let html = [];
    if(this.regionOrder.length > 1) {
      html.push(
        `<div class="region" data-region="all">
          <div class="region-title">All</div>
        </div>`
      );
    }

    this.regionOrder.forEach((region) => {
      html.push(
        `<div class="region" data-region="${region}">
          <div class="region-title">${region}</div>
        </div>`
      );
    });
  
    this.regionsList.innerHTML = html.join('\n');
    document.querySelector(`[data-region="${this.selectedRegion}"]`).classList.add('active');
  }


  private renderLocations() {
    let filter = {
      region: this.selectedRegion == 'all' ? null : this.selectedRegion,
      search: ''
    }

    // todo
    // do we want to render all views and hide based on selection?
    // for now dumb rendering of all each time

    // multiple region filters?
    // if(filter.inRegions.length) {
    //   filtered = [];
    //   filter.inRegions.forEach((region) => {
    //     // assumes multiple regions do not share a location
    //     filtered.push(...this.regionMap[region]);
    //   });
    // } else {
    //   filtered = this.locations;
    // }

    // grouped, probably game specific and dependent on quantity of locs per scene
    // for now just put one loc per scene all under the region name, unless on all

    let grouped = {};
    let ungrouped = [];

    if(filter.region) {
      grouped[filter.region] = this.regionMap[filter.region]
    } else {
      this.regionOrder.forEach((region) => {
        grouped[region] = this.regionMap[region]
      });
    }

    let html = [];
    let n = randInt(0, 10);

    // todo infer sub groupings or just assign under one

    for (const [group, locs] of Object.entries(grouped)) {
      html.push(`<div class="row-title">${group}</div>`);
      html.push(`<div class="sw-location-row">`);
      locs.forEach((location) => {
        n += 1;
        let bgColor = bgColors[n % bgColors.length];
        html.push(
          `<div class="location mini b" data-location="${location.id}">
            <div class="location-title">${location.title}</div>
            <div class="frame">
              <div class="location-img-wrapper" style="background-color: ${bgColor}"><img src="http://noclip.beyond3d.com/_Screenshots/mkwii_shopping_course_${n%7+1}.png"></div>
            </div>
          </div>`
        );
      });
      html.push('</div>');
    }

    if (ungrouped.length) {
      html.push(`<div class="sw-location-row">`);
      ungrouped.forEach((location) => {
        n += 1;
        let bgColor = bgColors[n % bgColors.length];
        html.push(
          `<div class="location mini b" data-location="${location.id}>
            <div class="location-title">${location.title}}</div>
            <div class="frame">
              <div class="location-img-wrapper" style="background-color: ${bgColor}"><img src="http://noclip.beyond3d.com/_Screenshots/mkwii_shopping_course_${n%7+1}.png"></div>
            </div>
          </div>`
        );
      });
      html.push('</div>');
    }

    let locArea = document.querySelector('.sw-locations');
    locArea.innerHTML = html.join('\n');
    let singleRow = locArea.offsetHeight < 200;

    this.menu.classList.toggle('single-row', singleRow);
    this.menuTabs.classList.toggle('single-row', singleRow);

  }


  private addRegions(regions) {
    let html = [];
    for (let i = 0; i < regions.length; i++) {
      html.push(
        `<div class="region ${i == 0 ? "active" : ""}">
          <div class="region-title">${regions[i]}</div>
        </div>`
      );
    }
    this.regionsList.innerHTML = html.join("\n");
  }

  public debugRegions() {
    let regions = [
      // "Goomba Village",
      "Toad Town",
      "Toad Town Tunnels",
      "Peach's Castle",
      "Shooting Star Summit",
      "Koopa Village",
      "Koopa Bros. Fortress",
      "Mt. Rugged",
      "Dry Dry Outpost",
      "Dry Dry Desert",
      "Dry Dry Ruins",
      "Forever Forest",
      "Boo's Mansion",
      "Gusty Gulch",
      "Tubba Blubba's Castle",
      "Shy Guy's Toybox",
      "Lavalava Island",
      "Mt. Lavalava",
      "Flower Fields",
      "Shiver City",
      "Crystal Palace",
      "Bowser's Castle",
      "System & Debug Maps",
    ];

    regions = [
      "Mushroom Castle",
      "First Floor Courses",
      "Basement Courses",
      "Second Floor Courses",
      "Third Floor Courses",
      "Bowser Levels",
      "Secret Levels",
      "Extra DS Levels",
    ];
    this.addRegions(regions);
    // this.debugAddLocations(20, 2, 6);
    this.tempAdd();
  }

  private tempAdd() {
    console.log("temp add");
    let rowTitles = ["Mushroom Castle"];
    let locationTitles = [
      "Outdoor Gardens",
      "Main Foyer",
      "Basement",
      "Upstairs",
      "Courtyard",
      "Rec Room",
    ];

    let html = [];
    let n = 0;
    for (let i = 0; i < rowTitles.length; i++) {
      html.push(`<div class="row-title">${rowTitles[i]}</div>`);
      html.push(`<div class="sw-location-row">`);
      for (let j = 0; j < locationTitles.length; j++) {
        let unique = (i + 1) * (j + 1);
        // let bgColor = sample(bgColors);
        let bgColor = bgColors[n % bgColors.length];
        n += 1;

        html.push(
          `<div class="location mini b ${j == 2 ? "dark" : ""}">
            <div class="location-title">${locationTitles[j]}</div>
            <div class="frame">
              <div class="location-img-wrapper" style="background-color: ${bgColor}"><img src="http://noclip.beyond3d.com/_Screenshots/mkwii_shopping_course_${
            (n % 7) + 1
          }.png"></div>
            </div>
          </div>`
        );
      }
      html.push("</div>");
    }
    document.querySelector(".sw-locations").innerHTML = html.join("\n");
  }

  private debugAddLocations(levels: number, min: number, max: number) {
    let rowTitles = [
      "Mushroom Castle",
      "First Floor Courses",
      "Basement Courses",
      "Second Floor Courses",
      "Third Floor Courses",
      "Bowser Levels",
      "Secret Levels",
      "Extra DS Levels",
    ];
    let html = [];
    let n = 0;
    for (let i = 0; i < levels; i++) {
      if (i < rowTitles.length) {
        html.push(`<div class="row-title">${rowTitles[i]}</div>`);
      }
      html.push(`<div class="sw-location-row">`);
      for (let j = 0; j < randInt(min, max); j++) {
        let unique = (i + 1) * (j + 1);
        // let bgColor = sample(bgColors);
        let bgColor = bgColors[n % bgColors.length];
        n += 1;

        html.push(
          `<div class="location mini b">
            <div class="location-title">Location Title</div>
            <div class="frame">
              <div class="location-img-wrapper" style="background-color: ${bgColor}"><img src="http://noclip.beyond3d.com/_Screenshots/mkwii_shopping_course_${
            (n % 7) + 1
          }.png"></div>
            </div>
          </div>`
        );

        // html.push(
        //   `<div class="location-img-wrapper"><img src="https://picsum.photos/450/220?blur=10&random=${unique}"></div>`
        // );
      }
      html.push("</div>");
    }
    document.querySelector(".sw-locations").innerHTML = html.join("\n");
  }
}
