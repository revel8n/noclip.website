
// import 'materialize-css/extras/noUiSlider/nouislider.css';
// import noUiSlider from 'materialize-css/extras/noUiSlider/nouislider';

// import feather from 'feather-icons/dist/feather.js';
// import rough from 'roughjs/dist/rough.umd.js';

// import SimpleBar from 'simplebar';
// //import 'simplebar';
// import 'simplebar/dist/simplebar.css';

// import animateScrollTo from 'animated-scroll-to';

// import '@fortawesome/fontawesome-free/css/all.min.css';
// import './fonts/fonts.css';
import './style.scss';

import { randInt, sample, shuffle } from './common/common';
import temp from './common/temp'


export class UI {

  constructor(viewer) {
      this.elem = document.createElement('div');
      this.elem.innerHTML = temp;
  }
}