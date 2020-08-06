export const temp = `<div class="sw-menu expanded scrollable">
<div class="sw-title-bar left-title">
    <div class="game">Super Mario 64 DS</div>
</div>
<div class="sw-left-panel">
    <div class="sw-list-scroll">
        <div class="sw-regions"></div>
    </div>
</div>

<div class="sw-grid-scroll">
    <div class="sw-locations">
        <div class="location-img-wrapper"><img src="img/locations/mkwii_shopping_course_1.png"></div>
            <div class="location-img-wrapper"><img src="img/locations/mkwii_shopping_course_2.png"></div>
            <div class="location-img-wrapper"><img src="img/locations/mkwii_shopping_course_3.png"></div>
            <div class="location-img-wrapper"><img src="img/locations/mkwii_shopping_course_4.png"></div>
            <div class="location-img-wrapper"><img src="img/locations/mkwii_shopping_course_5.png"></div>
            <div class="location-img-wrapper"><img src="img/locations/mkwii_shopping_course_6.png"></div>
            <div class="location-img-wrapper"><img src="img/locations/mkwii_shopping_course_7.png"></div>
    </div>
</div>

<div id="sw_tabs" class="actions-bar vertical">
    <button class="action squircle teal">
        <span class="aa">Aa</span>
    </button>

    <button value="share" class="action squircle action-share">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21,12L14,5V9C7,10 4,15 3,20C5.5,16.5 9,14.9 14,14.9V19L21,12Z" />
        </svg>
    </button>

    <button value="layers" class="action squircle action-layers">
        <i class="material-icons">layers</i>
    </button>

    <button value="fullscreen" class="action squircle action-fullscreen">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
            <path
                d="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z" />
        </svg>
    </button>
</div>


<div class="sw-bar panel-header">
    <div class="header-unit search">
        <div class="search-icon">
            <i class="material-icons">
                search
            </i>
        </div>
        <div class="input-wrapper"><input class="panel-input" placeholder="Search…" type="text"
                aria-label="search" value=""></div>
        <div class="line"></div>
    </div>
</div>
</div>

<div id="actions" class="actions-bar vertical hidden">
<button id="toggle_cam" value="toggle-cam" class="action squircle action-camera" aria-label="Toggle Camera">
    <span class="icon mdi mdi-cctv"></span>
    <div class="badge-container">
        <div id="cam_badge" class="control-badge active">wasd</div>
    </div>
</button>

<button value="share" class="action squircle action-share" aria-label="Share This Perspective">
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21,12L14,5V9C7,10 4,15 3,20C5.5,16.5 9,14.9 14,14.9V19L21,12Z" />
    </svg>
</button>

<button value="layers" class="action squircle action-layers" aria-label="Layers">
    <i class="material-icons">layers</i>
</button>


<button value="settings" class="action squircle action-settings" aria-label="Nuts & Bolts">
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
        <path
            d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
    </svg>
</button>

<button value="fullscreen" class="action squircle action-fullscreen" aria-label="Fullscreen">
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z" />
    </svg>
</button>
</div>`;