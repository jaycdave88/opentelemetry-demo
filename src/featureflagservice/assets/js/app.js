// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

// We import the CSS which is extracted to its own file by esbuild.
// Remove this line if you add a your own CSS build pipeline (e.g postcss).
import "../css/app.css"

// If you want to use Phoenix channels, run `mix help phx.gen.channel`
// to get started and then uncomment the line below.
// import "./user_socket.js"

// You can include dependencies in two ways.
//
// The simplest option is to put them in assets/vendor and
// import them using relative paths:
//
//     import "../vendor/some-package.js"
//
// Alternatively, you can `npm install some-package --prefix assets` and import
// them using a path starting with the package name:
//
//     import "some-package"
//

// Include phoenix_html to handle method=PUT/DELETE in forms and buttons.
import "phoenix_html"
// Establish Phoenix Socket and LiveView configuration.
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"
import topbar from "../vendor/topbar"

let csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
let liveSocket = new LiveSocket("/live", Socket, {params: {_csrf_token: csrfToken}})

// Show progress bar on live navigation and form submits
topbar.config({barColors: {0: "#29d"}, shadowColor: "rgba(0, 0, 0, .3)"})
window.addEventListener("phx:page-loading-start", info => topbar.show())
window.addEventListener("phx:page-loading-stop", info => topbar.hide())

// connect if there are any LiveViews on the page
liveSocket.connect()

// expose liveSocket on window for web console debug logs and latency simulation:
// >> liveSocket.enableDebug()
// >> liveSocket.enableLatencySim(1000)  // enabled for duration of browser session
// >> liveSocket.disableLatencySim()
window.liveSocket = liveSocket

// Function to handle the toggle change event
function handleToggleChange(event) {
    const checkbox = event.target;
    const enabledValue = checkbox.checked ? 1.0 : 0.0;
    console.log(`Feature flag ${checkbox.id} set to: ${enabledValue}`);
  
    // Update the hidden input to reflect the new state
    const hiddenInput = document.querySelector(`input[type="hidden"][name="${checkbox.getAttribute('name')}"]`);
    if (hiddenInput) {
      hiddenInput.value = enabledValue;
    }
  }
  
  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll('.switch input[type="checkbox"]').forEach(function(checkbox) {
      checkbox.addEventListener('change', function(e) {
        let enabledValue = e.target.checked ? "1.0" : "0.0";
        console.log(`Feature flag ${e.target.id} set to: ${enabledValue}`);
      });
    });
  });