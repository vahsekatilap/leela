/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  importScripts("push-sw.js");
  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "402b66900e731ca748771b6fc5e7a068"
  }, {
    "url": "push-sw.js",
    "revision": "a0fa6bd94abf36300e356754ebe8e6fc"
  }, {
    "url": "index.html",
    "revision": "af2147d59e0bac33cb3551793b151f8b"
  }, {
    "url": "icon-maskable-512.png",
    "revision": "0714d37eb01eca0b9cd3ac13a0e321fc"
  }, {
    "url": "icon-512.png",
    "revision": "dabe7498a60900d2cfe442f5ca785ad4"
  }, {
    "url": "icon-192.png",
    "revision": "ee860c22cf603d2546091d9e9d2dbfca"
  }, {
    "url": "favicon.svg",
    "revision": "d1a504cce4a43cb8af446c0aa0b39d16"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "4a622e72b3488d1afd021e7a1aac3ace"
  }, {
    "url": "assets/vaccines-BC2qrTr3.js",
    "revision": null
  }, {
    "url": "assets/uuid-B2BVraWC.js",
    "revision": null
  }, {
    "url": "assets/useWidth-lL7MGfKo.js",
    "revision": null
  }, {
    "url": "assets/units-CL0ynjfU.js",
    "revision": null
  }, {
    "url": "assets/ui-DwObDSmi.js",
    "revision": null
  }, {
    "url": "assets/supplements-D7P4gHqF.js",
    "revision": null
  }, {
    "url": "assets/store-T60GmzNd.js",
    "revision": null
  }, {
    "url": "assets/solids-BUppUhGX.js",
    "revision": null
  }, {
    "url": "assets/seed-CjKy_2c6.js",
    "revision": null
  }, {
    "url": "assets/photos-XK0Olro3.js",
    "revision": null
  }, {
    "url": "assets/period-7hcR7KH1.js",
    "revision": null
  }, {
    "url": "assets/pdf.worker.min-DI4FfYVf.js",
    "revision": null
  }, {
    "url": "assets/pdf-ULJPBbF3.js",
    "revision": null
  }, {
    "url": "assets/mukta-latin-700-normal-CI4CvK0O.woff2",
    "revision": null
  }, {
    "url": "assets/mukta-latin-600-normal-5TtPlXMC.woff2",
    "revision": null
  }, {
    "url": "assets/mukta-latin-500-normal-9gFvN3k4.woff2",
    "revision": null
  }, {
    "url": "assets/mukta-latin-400-normal-DXND9OdD.woff2",
    "revision": null
  }, {
    "url": "assets/insights-38A96Iin.js",
    "revision": null
  }, {
    "url": "assets/index-n890ZSht.js",
    "revision": null
  }, {
    "url": "assets/index-BLl8ourV.css",
    "revision": null
  }, {
    "url": "assets/development-BlHKNla0.js",
    "revision": null
  }, {
    "url": "assets/charts-CtuTr1VX.js",
    "revision": null
  }, {
    "url": "assets/chartUtils-CHieH8sZ.js",
    "revision": null
  }, {
    "url": "assets/bits-DzDYPwWE.js",
    "revision": null
  }, {
    "url": "assets/baloo-2-vietnamese-wght-normal-C4ZonJY6.woff2",
    "revision": null
  }, {
    "url": "assets/baloo-2-latin-wght-normal-B_TVFhwJ.woff2",
    "revision": null
  }, {
    "url": "assets/baloo-2-latin-ext-wght-normal-Dz43yst_.woff2",
    "revision": null
  }, {
    "url": "assets/baloo-2-devanagari-wght-normal-B4j4n2PV.woff2",
    "revision": null
  }, {
    "url": "assets/alerts-DQOYj9rD.js",
    "revision": null
  }, {
    "url": "assets/actions-C2cIpZ0S.js",
    "revision": null
  }, {
    "url": "assets/VisitScreen-DYain2hy.js",
    "revision": null
  }, {
    "url": "assets/VaccinesScreen-BWOe-rcv.js",
    "revision": null
  }, {
    "url": "assets/TimeField-DEm54AI6.js",
    "revision": null
  }, {
    "url": "assets/TellScreen-GHmKmzCA.js",
    "revision": null
  }, {
    "url": "assets/Star.es-DjvGd4ZN.js",
    "revision": null
  }, {
    "url": "assets/SolidsScreen-Di32JgYT.js",
    "revision": null
  }, {
    "url": "assets/Sheet-BkGP6ZtY.js",
    "revision": null
  }, {
    "url": "assets/ReportScreen-CPB7VWIQ.js",
    "revision": null
  }, {
    "url": "assets/PumpingScreen-BS1-jQRb.js",
    "revision": null
  }, {
    "url": "assets/Printer.es-Dotw4VLG.js",
    "revision": null
  }, {
    "url": "assets/PhotoPicker-BrQBk0d1.js",
    "revision": null
  }, {
    "url": "assets/NotesScreen-e-yOuazY.js",
    "revision": null
  }, {
    "url": "assets/NotePencil.es-ByTg3okA.js",
    "revision": null
  }, {
    "url": "assets/MagnifyingGlass.es-B9691ov0.js",
    "revision": null
  }, {
    "url": "assets/Lightbulb.es-CBudBirW.js",
    "revision": null
  }, {
    "url": "assets/ImportScreen-DK58DfaY.js",
    "revision": null
  }, {
    "url": "assets/Icon-_3CCDXMo.js",
    "revision": null
  }, {
    "url": "assets/HistoryScreen-B1wliULC.js",
    "revision": null
  }, {
    "url": "assets/GrowthCard-C90XOjcG.js",
    "revision": null
  }, {
    "url": "assets/FileText.es-Bo-dMnON.js",
    "revision": null
  }, {
    "url": "assets/FileArrowUp.es-g2bAXrie.js",
    "revision": null
  }, {
    "url": "assets/FamilyScreen-BTy4Myh1.js",
    "revision": null
  }, {
    "url": "assets/Drop.es-BKtWc2qo.js",
    "revision": null
  }, {
    "url": "assets/DiaryScreen-9Ke-uLg_.js",
    "revision": null
  }, {
    "url": "assets/DevelopmentScreen-902j1sBK.js",
    "revision": null
  }, {
    "url": "assets/CaretRight.es-DnJDB5bJ.js",
    "revision": null
  }, {
    "url": "assets/CaretDown.es-BCgr0LcQ.js",
    "revision": null
  }, {
    "url": "assets/BookScreen-1hpvFdxD.js",
    "revision": null
  }, {
    "url": "assets/BarChart-DIcYnNys.js",
    "revision": null
  }, {
    "url": "assets/ArrowLeft.es-CPCmXiTR.js",
    "revision": null
  }, {
    "url": "assets/AdminScreen-N4Un9Qmx.js",
    "revision": null
  }, {
    "url": "assets/AddRecords-41OYKPno.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "4a622e72b3488d1afd021e7a1aac3ace"
  }, {
    "url": "favicon.svg",
    "revision": "d1a504cce4a43cb8af446c0aa0b39d16"
  }, {
    "url": "icon-192.png",
    "revision": "ee860c22cf603d2546091d9e9d2dbfca"
  }, {
    "url": "icon-512.png",
    "revision": "dabe7498a60900d2cfe442f5ca785ad4"
  }, {
    "url": "icon-maskable-512.png",
    "revision": "0714d37eb01eca0b9cd3ac13a0e321fc"
  }, {
    "url": "manifest.webmanifest",
    "revision": "571abd70078f9e5efaa27d3d956cc21a"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/leela/index.html"), {
    denylist: [/^\/rest\//, /^\/auth\//]
  }));

}));
