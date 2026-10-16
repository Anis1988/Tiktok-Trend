package app.tiktoktrend;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdatePlugin.class); // ⬆️ the update banner's Update button
        registerPlugin(WidgetPlugin.class); // 🏠 the home-screen widget: the app sends it the latest numbers
        super.onCreate(savedInstanceState);
    }
}
