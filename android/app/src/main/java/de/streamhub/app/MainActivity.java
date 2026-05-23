package de.streamhub.app;

import android.app.PictureInPictureParams;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Rational;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.os.Bundle;
import android.content.Context;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private OnBackPressedCallback webViewBackCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Register our back callback with HIGHEST priority (registered first = highest)
        // When DISABLED → predictive back gesture shows the system animation
        // When ENABLED  → we intercept and forward to JS
        webViewBackCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function(){ if(window._handleBackAction) return window._handleBackAction(); return false; })()",
                        result -> {
                            if ("false".equals(result)) {
                                runOnUiThread(() -> webViewBackCallback.setEnabled(false));
                            }
                        }
                    );
                }
            }
        };
        getOnBackPressedDispatcher().addCallback(this, webViewBackCallback);

        // Setup JavaScript interfaces
        this.runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setJavaScriptEnabled(true);

                webView.addJavascriptInterface(new Object() {

                    @android.webkit.JavascriptInterface
                    public void setBackHandlerEnabled(boolean enabled) {
                        runOnUiThread(() -> webViewBackCallback.setEnabled(enabled));
                    }

                    @android.webkit.JavascriptInterface
                    public boolean isBackHandlerEnabled() {
                        return webViewBackCallback.isEnabled();
                    }

                    // Haptic vibration — M3 Expressive touch feedback
                    @android.webkit.JavascriptInterface
                    public void vibrate(int durationMs) {
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                                if (vm != null) {
                                    vm.getDefaultVibrator().vibrate(
                                        VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE)
                                    );
                                }
                            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                                if (v != null) {
                                    v.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE));
                                }
                            }
                        } catch (Exception e) { /* ignore */ }
                    }

                    // Click haptic — short crisp tick
                    @android.webkit.JavascriptInterface
                    public void hapticTick() {
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                Vibrator v;
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                                    v = vm != null ? vm.getDefaultVibrator() : null;
                                } else {
                                    v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                                }
                                if (v != null) {
                                    v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));
                                }
                            }
                        } catch (Exception e) { /* ignore */ }
                    }

                    // Heavy haptic — for important actions
                    @android.webkit.JavascriptInterface
                    public void hapticHeavy() {
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                Vibrator v;
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                                    v = vm != null ? vm.getDefaultVibrator() : null;
                                } else {
                                    v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                                }
                                if (v != null) {
                                    v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK));
                                }
                            }
                        } catch (Exception e) { /* ignore */ }
                    }

                    // Material You dynamic colors
                    @android.webkit.JavascriptInterface
                    public String getSystemColors() {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            try {
                                int primary      = getResources().getColor(android.R.color.system_accent1_200, getTheme());
                                int primaryHover = getResources().getColor(android.R.color.system_accent1_300, getTheme());
                                int background   = getResources().getColor(android.R.color.system_neutral1_900, getTheme());
                                int surface      = getResources().getColor(android.R.color.system_neutral1_800, getTheme());
                                int surfaceLight = getResources().getColor(android.R.color.system_neutral2_700, getTheme());
                                int accent2      = getResources().getColor(android.R.color.system_accent2_200, getTheme());
                                int accent3      = getResources().getColor(android.R.color.system_accent3_200, getTheme());

                                return String.format(
                                    "{\"primary\":\"%s\",\"primaryHover\":\"%s\",\"background\":\"%s\"," +
                                    "\"surface\":\"%s\",\"surfaceLight\":\"%s\",\"accent2\":\"%s\",\"accent3\":\"%s\"}",
                                    hex(primary), hex(primaryHover), hex(background),
                                    hex(surface), hex(surfaceLight), hex(accent2), hex(accent3)
                                );
                            } catch (Exception e) { /* fallback */ }
                        }
                        return "{}";
                    }
                }, "AndroidNativeTheme");
            }
        });

        hideSystemUI();
    }

    private static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    private void hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                String title = webView.getTitle();
                if (title != null && title.contains("[PLAYING]")) {
                    PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                    builder.setAspectRatio(new Rational(16, 9));
                    enterPictureInPictureMode(builder.build());
                }
            }
        }
    }
}
