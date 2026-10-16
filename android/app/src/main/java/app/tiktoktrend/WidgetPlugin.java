package app.tiktoktrend;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the latest numbers from the app (already in words) and refreshes the home-screen widget. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    static final String PREFS = "tt_widget";
    static final String[] KEYS = { "date", "big", "label", "title", "status", "series" };

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (String k : KEYS) e.putString(k, call.getString(k, ""));
        e.putBoolean("waiting", call.getBoolean("waiting", false));
        e.apply();
        VideosWidget.updateAll(ctx);
        call.resolve();
    }
}
