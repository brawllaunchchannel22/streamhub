package de.streamhub.app;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Rational;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    // PiP control action constants
    private static final String ACTION_PIP_PLAY_PAUSE = "de.streamhub.app.PIP_PLAY_PAUSE";
    private static final String ACTION_PIP_REWIND     = "de.streamhub.app.PIP_REWIND";
    private static final String ACTION_PIP_FORWARD    = "de.streamhub.app.PIP_FORWARD";
    private static final int    PIP_REQUEST_CODE      = 42;

    private BroadcastReceiver pipActionReceiver;
    private boolean _isInPip = false;

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

                    // Update PiP auto-enter status for Android 12+ (API 31+)
                    @android.webkit.JavascriptInterface
                    public void updatePipAutoEnter(boolean enabled) {
                        runOnUiThread(() -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                try {
                                    PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                                    builder.setAspectRatio(new Rational(16, 9));
                                    builder.setAutoEnterEnabled(enabled);
                                    List<RemoteAction> actions = buildPipActions();
                                    if (!actions.isEmpty()) builder.setActions(actions);
                                    setPictureInPictureParams(builder.build());
                                } catch (Exception e) { e.printStackTrace(); }
                            }
                        });
                    }

                    // Native Android Picture-in-Picture mode trigger
                    @android.webkit.JavascriptInterface
                    public void enterPip() {
                        runOnUiThread(() -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                try {
                                    WebView webView = getBridge().getWebView();
                                    if (webView != null) {
                                        webView.evaluateJavascript(
                                            "document.body.classList.add('in-pip-mode');" +
                                            "var vm=document.getElementById('videoModal');if(vm)vm.classList.add('active');" +
                                            "void 0;",
                                            res -> webView.post(() -> {
                                                try {
                                                    enterPipWithControls();
                                                } catch (Exception e) { e.printStackTrace(); }
                                            })
                                        );
                                    }
                                } catch (Exception e) { e.printStackTrace(); }
                            }
                        });
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
    public void onResume() {
        super.onResume();
        hideSystemUI();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!isInPictureInPictureMode()) {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.evaluateJavascript("document.body.classList.remove('in-pip-mode'); void 0;", null);
                }
            }
        }
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
                webView.evaluateJavascript(
                    "(function(){ var m=document.getElementById('videoModal'); return m && m.classList.contains('active'); })()",
                    res -> {
                        if ("true".equals(res)) {
                            // Step 1: add CSS class so WebView hides all UI except video
                            webView.evaluateJavascript(
                                "document.body.classList.add('in-pip-mode'); void 0;",
                                r -> {
                                    // Step 2: wait 200ms for browser reflow+repaint THEN enter PiP
                                    // so Android captures the fullscreen video, not the modal layout
                                    webView.postDelayed(() -> {
                                        try {
                                            enterPipWithControls();
                                        } catch (Exception e) {
                                            webView.evaluateJavascript("document.body.classList.remove('in-pip-mode'); void 0;", null);
                                        }
                                    }, 200);
                                }
                            );
                        }
                    }
                );
            }
        }
    }

    // ── PiP helpers ──────────────────────────────────────────────────────────
    private void enterPipWithControls() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
            builder.setAspectRatio(new Rational(16, 9));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                List<RemoteAction> actions = buildPipActions();
                if (!actions.isEmpty()) builder.setActions(actions);
            }
            registerPipReceiver();
            enterPictureInPictureMode(builder.build());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @SuppressWarnings("deprecation")
    private List<RemoteAction> buildPipActions() {
        List<RemoteAction> actions = new ArrayList<>();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return actions;
        try {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

            // Rewind 10s
            Intent rewindIntent = new Intent(ACTION_PIP_REWIND).setPackage(getPackageName());
            PendingIntent rewindPI = PendingIntent.getBroadcast(this, PIP_REQUEST_CODE + 1, rewindIntent, flags);
            RemoteAction rewindAction = new RemoteAction(
                Icon.createWithResource(this, android.R.drawable.ic_media_previous),
                "-10s", "Zurückspulen", rewindPI);
            actions.add(rewindAction);

            // Play/Pause
            Intent ppIntent = new Intent(ACTION_PIP_PLAY_PAUSE).setPackage(getPackageName());
            PendingIntent ppPI = PendingIntent.getBroadcast(this, PIP_REQUEST_CODE, ppIntent, flags);
            RemoteAction ppAction = new RemoteAction(
                Icon.createWithResource(this, android.R.drawable.ic_media_pause),
                "Pause/Play", "Pause / Abspielen", ppPI);
            actions.add(ppAction);

            // Forward 10s
            Intent fwdIntent = new Intent(ACTION_PIP_FORWARD).setPackage(getPackageName());
            PendingIntent fwdPI = PendingIntent.getBroadcast(this, PIP_REQUEST_CODE + 2, fwdIntent, flags);
            RemoteAction fwdAction = new RemoteAction(
                Icon.createWithResource(this, android.R.drawable.ic_media_next),
                "+10s", "Vorspulen", fwdPI);
            actions.add(fwdAction);
        } catch (Exception e) { e.printStackTrace(); }
        return actions;
    }

    private void registerPipReceiver() {
        if (pipActionReceiver != null) return;
        pipActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (intent == null) return;
                WebView wv = getBridge().getWebView();
                if (wv == null) return;
                String action = intent.getAction();
                if (ACTION_PIP_PLAY_PAUSE.equals(action)) {
                    wv.evaluateJavascript(
                        "(function(){ var v=document.getElementById('videoPlayer'); if(!v) return;" +
                        "if(v.paused) v.play(); else v.pause(); })()", null);
                } else if (ACTION_PIP_REWIND.equals(action)) {
                    wv.evaluateJavascript(
                        "(function(){ var v=document.getElementById('videoPlayer'); if(v) v.currentTime=Math.max(0,v.currentTime-10); })()", null);
                } else if (ACTION_PIP_FORWARD.equals(action)) {
                    wv.evaluateJavascript(
                        "(function(){ var v=document.getElementById('videoPlayer'); if(v) v.currentTime=Math.min(v.duration,v.currentTime+10); })()", null);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PIP_PLAY_PAUSE);
        filter.addAction(ACTION_PIP_REWIND);
        filter.addAction(ACTION_PIP_FORWARD);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(pipActionReceiver, filter);
        }
    }

    private void unregisterPipReceiver() {
        if (pipActionReceiver != null) {
            try { unregisterReceiver(pipActionReceiver); } catch (Exception ignored) {}
            pipActionReceiver = null;
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, android.content.res.Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        _isInPip = isInPictureInPictureMode;
        WebView webView = getBridge().getWebView();
        if (!isInPictureInPictureMode) {
            // EXIT: restore UI
            unregisterPipReceiver();
            if (webView != null) {
                webView.evaluateJavascript(
                    "document.body.classList.remove('in-pip-mode'); void 0;", null);
            }
        }
    }

    @Override
    public void onDestroy() {
        unregisterPipReceiver();
        super.onDestroy();
    }
}
