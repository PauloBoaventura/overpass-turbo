import $ from "jquery";
import map from "./map";
import settings from "./settings";
import wait from "./waiter";
import shortcuts from "./shortcuts";
import overpass from "./overpass";
import i18n from "./i18n";
import config from "./config";
import htmlentities from "html-entities";
import Sidebar from "./sidebar";
import Query from "./query";
import parser from "./queryparser";
import exportDialog from "./export";
import geolocate from "./geolocate";
import ffs from "./ffs";
import styler from "./styler";
import settingsDialog from "./settings-dialog";
import saveDialog from "./save";
import loadDialog from "./load";
import urlParameters from "./urlParameters";
import browserCompat from "./browserCompat";
import osmAuth from "osm-auth";

const ide = {
  query: undefined,
  map: undefined,
  waiter: undefined,
  onExportClick: exportDialog.onExportClick,
  onExportClose: exportDialog.onExportClose,
  onExportDownloadClose: exportDialog.onExportDownloadClose,
  onExportClipboardClose: exportDialog.onExportClipboardClose,
  onShareClick: exportDialog.onShareClick,
  onSaveClick: saveDialog.onSaveClick,
  onSaveClose: saveDialog.onSaveClose,
  onSaveSubmit: saveDialog.onSaveSubmit,
  onLoadClick: loadDialog.onLoadClick,
  onLoadClose: loadDialog.onLoadClose,
  onLogoutClick: saveDialog.onLogoutClick,
  onSettingsClick: settingsDialog.onSettingsClick,
  onSettingsClose: settingsDialog.onSettingsClose,
  onHelpClick() {
    $("#help-dialog").addClass("is-active");
  },
  onHelpClose() {
    $("#help-dialog").removeClass("is-active");
  },
  onFfsClick: ffs.onFfsClick,
  onFfsClose: ffs.onFfsClose,
  onFfsRun: ffs.onFfsRun,
  onFfsBuild: ffs.onFfsBuild,
  onStylerClick: styler.onStylerClick,
  onStylerClose: styler.onStylerClose,
  onRunClick() {
    this.run_query();
  },
  onRerenderClick() {
    this.rerender_map();
  },
  init() {
    browserCompat.showCompatibilityWarningIfNeeded();

    this.map = map.init();
    this.waiter = wait;
    this.query = new Query();
    shortcuts.init(this);
    urlParameters.init(this);

    $(".tabs li.Map").click(() => this.switchTab("Map"));
    $(".tabs li.Data").click(() => this.switchTab("Data"));

    // handlers for ui widgets
    $("#help-dialog .modal-background").click(this.onHelpClose);
    $("#styler-dialog .modal-background").click(this.onStylerClose);
    $("#settings-dialog .modal-background").click(this.onSettingsClose);
    $("#save-dialog .modal-background").click(this.onSaveClose);
    $("#load-dialog .modal-background").click(this.onLoadClose);
    $("#ffs-dialog .modal-background").click(this.onFfsClose);
    $("#export-dialog .modal-background").click(this.onExportClose);
    $("#export-download-dialog .modal-background").click(
      this.onExportDownloadClose
    );
    $("#export-clipboard-success .modal-background").click(
      this.onExportClipboardClose
    );

    // auth helper
    saveDialog.auth = osmAuth(config.osmAuth);

    // map popup style update hook
    ide.map.on("popupopen popupclose", (e) => {
      if (typeof e.popup.layer != "undefined") {
        const layer = e.popup.layer.placeholder || e.popup.layer;
        const stl = overpass.osmLayer._baseLayer.options.style(
          layer.feature,
          e.type == "popupopen"
        );
        if (typeof layer.eachLayer != "function") {
          if (typeof layer.setStyle == "function") layer.setStyle(stl);
        } else
          layer.eachLayer((layer) => {
            if (typeof layer.setStyle == "function") layer.setStyle(stl);
          });
      }
    });

    // init overpass object
    overpass.init();

    // event handlers for overpass object
    overpass.handlers["onProgress"] = function (msg, abortcallback) {
      ide.waiter.addInfo(msg, abortcallback);
    };
    overpass.handlers["onDone"] = function () {
      const name_match = ide.getRawQuery().match(/@name ([^\n]+)/);
      const title_prefix = name_match ? `${name_match[1]} | ` : "";
      ide.waiter.close(title_prefix);

      const baseLayer = overpass.osmLayer?.getBaseLayer?.();
      if (!baseLayer || typeof baseLayer.getBounds !== "function") {
        return;
      }

      const map_bounds = ide.map.getBounds();
      const data_bounds = baseLayer.getBounds();
      if (data_bounds.isValid() && !map_bounds.intersects(data_bounds)) {
        const prev_content = $(".leaflet-control-buttons-fitdata").tooltip(
          "option",
          "content"
        );
        $(".leaflet-control-buttons-fitdata").tooltip(
          "option",
          "content",
          `← ${i18n.t("map_controlls.suggest_zoom_to_data")}`
        );
        $(".leaflet-control-buttons-fitdata").tooltip("open");
        $(".leaflet-control-buttons-fitdata").tooltip("option", "hide", {
          effect: "fadeOut",
          duration: 1000
        });
        setTimeout(() => {
          $(".leaflet-control-buttons-fitdata").tooltip(
            "option",
            "content",
            prev_content
          );
          $(".leaflet-control-buttons-fitdata").tooltip("close");
          $(".leaflet-control-buttons-fitdata").tooltip("option", "hide", {
            effect: "fadeOut",
            duration: 100
          });
        }, 2600);
      }
    };
    overpass.handlers["onEmptyMap"] = function () {
      ide.waiter.close();
    };
    overpass.handlers["onQueryError"] = function (errmsg) {
      ide.waiter.close();
      ide.query.err(msg = errmsg);
    };
    overpass.handlers["onAjaxError"] = function (errmsg) {
      ide.waiter.close();
      ide.query.err(errmsg);
    };

    this.map.on("moveend", () => {
      this.update_map_link();
    });

    this.update_map_link();
  },
  switchTab(tab) {
    if (tab == "Map") {
      $(".tabs li").removeClass("is-active");
      $(".tabs li.Map").addClass("is-active");
      $("#data").hide();
      $("#map").show();
      this.map.invalidateSize(false);
    } else {
      $(".tabs li").removeClass("is-active");
      $(".tabs li.Data").addClass("is-active");
      $("#map").hide();
      $("#data").show();
    }
  },
  update_map_link() {
    const c = this.map.getCenter();
    const z = this.map.getZoom();
    const hash = `#map=${z}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`;
    history.replaceState(history.state, document.title, hash);
  },
  getQuery() {
    return this.query.get();
  },
  getRawQuery() {
    return this.query.get(true);
  },
  setQuery(query, nofocus) {
    return this.query.set(query, nofocus);
  },
  run_query() {
    const q = this.getQuery();
    parser.parse(q);
    this.query.clearError();
    this.waiter.open();
    overpass.run_query(q, this.map);
  },
  rerender_map() {
    overpass.rerender();
  }
};

export default ide;
