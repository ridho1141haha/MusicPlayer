package com.ridho.music.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.player.MediaItemConverter;

import java.util.ArrayList;
import java.util.List;

/** Compact square card used in the horizontal "Recently played" shelf. */
public class HorizontalTrackAdapter extends RecyclerView.Adapter<HorizontalTrackAdapter.VH> {

    public interface Callback {
        void onTrackClick(@NonNull Track track, int position);
    }

    private final List<Track> items = new ArrayList<>();
    private final Callback callback;

    public HorizontalTrackAdapter(Callback callback) {
        this.callback = callback;
    }

    public List<Track> currentItems() {
        return items;
    }

    public void submit(List<Track> newItems) {
        items.clear();
        if (newItems != null) items.addAll(newItems);
        notifyDataSetChanged(); // small shelf; DiffUtil overhead not warranted
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_track_compact, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        Track t = items.get(position);
        holder.title.setText(t.title);
        holder.artist.setText(t.artist);
        Glide.with(holder.artwork)
                .load(MediaItemConverter.artworkUri(t))
                .placeholder(R.drawable.bg_artwork_placeholder)
                .centerCrop()
                .into(holder.artwork);
        holder.itemView.setOnClickListener(v -> {
            int pos = holder.getBindingAdapterPosition();
            if (pos != RecyclerView.NO_POSITION && callback != null) {
                callback.onTrackClick(items.get(pos), pos);
            }
        });
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        final ImageView artwork;
        final TextView title;
        final TextView artist;

        VH(@NonNull View itemView) {
            super(itemView);
            artwork = itemView.findViewById(R.id.compact_artwork);
            title = itemView.findViewById(R.id.compact_title);
            artist = itemView.findViewById(R.id.compact_artist);
        }
    }
}
