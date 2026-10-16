package app.tiktoktrend;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 🎬 "Trend Videos" home-screen widget: videos waiting for you, the newest video's title and status, and today's
 * series name. The app sends the words (WidgetPlugin) each time it refreshes the video list. Tap = open the app.
 */
public class VideosWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, VideosWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    static RemoteViews views(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean any = !p.getString("big", "").isEmpty();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_videos);
        if (!any) {
            v.setTextViewText(R.id.w_big, "–");
            v.setTextViewText(R.id.w_label, "Open the app once");
            v.setTextViewText(R.id.w_title, "to show your videos here");
            v.setTextViewText(R.id.w_status, "");
            v.setTextViewText(R.id.w_series, "");
        } else {
            v.setTextViewText(R.id.w_big, p.getString("big", ""));
            v.setTextViewText(R.id.w_label, p.getString("label", ""));
            v.setTextViewText(R.id.w_title, p.getString("title", ""));
            v.setTextViewText(R.id.w_status, p.getString("status", ""));
            // Today's series name only on the day it was sent (a new day starts without one until the app refreshes).
            v.setTextViewText(R.id.w_series, today.equals(p.getString("date", "")) ? p.getString("series", "") : "");
            v.setTextColor(R.id.w_big, p.getBoolean("waiting", false) ? 0xFF22D3EE : 0xFFFFFFFF);
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_root, pi);
        return v;
    }
}
