// forgive me for my sins

let temp = `<div class="placeholder active"></div>

<div class="sw-menu expanded scrollable">
<div class="sw-title-bar left-title">
    <div class="icon"><svg width="100%" height="100%" viewBox="0 0 448 512" fill="currentColor"><path d="M95.9 33.5c-44.6 8-80.5 41-91.8 84.4C0 133.6-.3 142.8.2 264.4.4 376 .5 378.6 2.4 387.3c10.3 46.5 43.3 79.6 90.3 90.5 6.1 1.4 13.9 1.7 64.1 1.9 51.9.4 57.3.3 58.7-1.1 1.4-1.4 1.5-19.3 1.5-222.2 0-150.5-.3-221.3-.9-222.6-.9-1.7-2.5-1.8-56.9-1.7-44.2.1-57.5.4-63.3 1.4zm83.9 222.6V444l-37.8-.5c-34.8-.4-38.5-.6-45.5-2.3-29.9-7.7-52-30.7-58.3-60.7-2-9.4-2-240.1-.1-249.3 5.6-26.1 23.7-47.7 48-57.4 12.2-4.9 17.9-5.5 57.6-5.6l35.9-.1v188zm-75.9-131.2c-5.8 1.1-14.7 5.6-19.5 9.7-9.7 8.4-14.6 20.4-13.8 34.5.4 7.3.8 9.3 3.8 15.2 4.4 9 10.9 15.6 19.9 20 6.2 3.1 7.8 3.4 15.9 3.7 7.3.3 9.9 0 14.8-1.7 20.1-6.8 32.3-26.3 28.8-46.4-3.9-23.7-26.6-39.7-49.9-35zm158.2-92.3c-.4.3-.6 100.8-.6 223.5 0 202.3.1 222.8 1.5 223.4 2.5.9 74.5.6 83.4-.4 37.7-4.3 71-27.2 89-61.2 2.3-4.4 5.4-11.7 7-16.2 5.8-17.4 5.7-12.8 5.7-146.1 0-106.4-.2-122.3-1.5-129-9.2-48.3-46.1-84.8-94.5-93.1-6.5-1.1-16.5-1.4-48.8-1.4-22.4-.1-40.9.2-41.2.5zm99.1 202.1c14.5 3.8 26.3 14.8 31.2 28.9 3.1 8.7 3 21.5-.1 29.5-5.7 14.7-16.8 25-31.1 28.8-23.2 6-47.9-8-54.6-31-2-7-1.9-18.9.4-26.2 6.9-22.7 31-36.1 54.2-30z"/></svg></div>
    <div class="game">Super Mario 64 <span class="sub">DS</span></div>
</div>
<div class="sw-left-panel">
    <div class="sw-list-scroll">
        <div class="sw-regions"></div>
    </div>
</div>

<div class="sw-grid-scroll">
    <div class="sw-locations">
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
    <div class="sw-logo"><span>no</span>clip</div>
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

export default temp;