# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0


defmodule FeatureflagserviceWeb.Router do
  use FeatureflagserviceWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, {FeatureflagserviceWeb.LayoutView, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", FeatureflagserviceWeb do
    pipe_through :browser

    get "/", PageController, :index
    get "/featureflags/toggle", FeatureFlagController, :toggle
    post "/featureflags/:name/toggle", FeatureFlagController, :toggle
    resources "/featureflags", FeatureFlagController, param: "name"
  end
end
