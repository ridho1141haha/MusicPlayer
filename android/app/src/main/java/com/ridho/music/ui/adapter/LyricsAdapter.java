package com.ridho.music.ui.adapter;

import android.graphics.Typeface;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.ridho.music.R;
import com.ridho.music.lyrics.LrcParser;

import java.util.ArrayList;
import java.util.List;

/**
 * Synchronized/unsynchronized lyric lines for the Now Playing screen.
 * The active line is highlighted and the list scrolls (position driven by the owner).
 */
public class LyricsAdapter extends RecyclerView.Adapter<LyricsAdapter.VH> {

    private final List<LrcParser.Line> lines = new ArrayList<>();
    private boolean synced = false;
    private int activeIndex = -1;

    public void submit(LrcParser.Lyrics lyrics) {
        lines.clear();
        if (lyrics != null) lines.addAll(lyrics.lines);
        synced = lyrics != null && lyrics.synced;
        activeIndex = -1;
        notifyDataSetChanged();
    }

    public boolean isSynced() {
        return synced;
    }

    public void setActiveIndex(int index) {
        if (index != activeIndex) {
            int previous = activeIndex;
            activeIndex = index;
            if (previous >= 0) notifyItemChanged(previous);
            if (index >= 0) notifyItemChanged(index);
        }
    }

    public int getActiveIndex() {
        return activeIndex;
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_lyrics_line, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        holder.text.setText(lines.get(position).text);
        boolean active = position == activeIndex && synced;
        holder.text.setTypeface(null, active ? Typeface.BOLD : Typeface.NORMAL);
        holder.text.setAlpha(active ? 1f : 0.55f);
    }

    @Override
    public int getItemCount() {
        return lines.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        final TextView text;

        VH(@NonNull View itemView) {
            super(itemView);
            text = itemView.findViewById(R.id.lyrics_line);
        }
    }
}
