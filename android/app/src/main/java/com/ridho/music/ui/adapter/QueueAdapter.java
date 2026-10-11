package com.ridho.music.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.ridho.music.R;
import com.ridho.music.domain.model.Track;

import java.util.ArrayList;
import java.util.List;

/** Rows inside the queue bottom sheet; highlights the currently playing item. */
public class QueueAdapter extends RecyclerView.Adapter<QueueAdapter.VH> {

    public interface Callback {
        void onItemClick(int position);

        void onRemoveClick(int position);
    }

    private final List<Track> items = new ArrayList<>();
    private final Callback callback;
    private int currentIndex = -1;

    public QueueAdapter(Callback callback) {
        this.callback = callback;
    }

    public void submit(List<Track> newItems, int nowPlayingIndex) {
        items.clear();
        if (newItems != null) items.addAll(newItems);
        currentIndex = nowPlayingIndex;
        notifyDataSetChanged();
    }

    /**
     * Optimistic in-place move for drag-to-reorder; keeps the highlight on the
     * playing track while the async player event catches up.
     */
    public void moveItem(int from, int to) {
        if (from == to || from < 0 || to < 0 || from >= items.size() || to >= items.size()) {
            return;
        }
        Track moved = items.remove(from);
        items.add(to, moved);
        if (currentIndex == from) {
            currentIndex = to;
        } else if (from < currentIndex && to >= currentIndex) {
            currentIndex--;
        } else if (from > currentIndex && to <= currentIndex) {
            currentIndex++;
        }
        notifyItemMoved(from, to);
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_queue, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        Track t = items.get(position);
        boolean current = position == currentIndex;
        holder.title.setText(t.title);
        holder.artist.setText(t.artist);
        holder.title.setTextColor(current
                ? holder.title.getResources().getColor(R.color.primary, null)
                : holder.title.getResources().getColor(R.color.on_surface, null));
        holder.remove.setVisibility(current ? View.INVISIBLE : View.VISIBLE);
        holder.itemView.setOnClickListener(v -> callback.onItemClick(position));
        holder.remove.setOnClickListener(v -> callback.onRemoveClick(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        final TextView title;
        final TextView artist;
        final ImageButton remove;

        VH(@NonNull View itemView) {
            super(itemView);
            title = itemView.findViewById(R.id.queue_title);
            artist = itemView.findViewById(R.id.queue_artist);
            remove = itemView.findViewById(R.id.queue_remove);
        }
    }
}
