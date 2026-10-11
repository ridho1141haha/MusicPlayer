package com.ridho.music.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.player.MediaItemConverter;
import com.ridho.music.ui.FormatUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Flat rows for the search screen: section headers, track rows and an
 * experimental-integration footer. Rows are plain value objects.
 */
public class SearchResultsAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {

    private static final int TYPE_HEADER = 0;
    private static final int TYPE_TRACK = 1;
    private static final int TYPE_FOOTER = 2;

    public interface Callback {
        void onRowClick(@NonNull Track track, int position);

        void onRowMenu(@NonNull Track track, @NonNull View anchor);
    }

    public static final class Row {
        public final int type;
        public final String header;
        public final Track track;

        private Row(int type, String header, Track track) {
            this.type = type;
            this.header = header;
            this.track = track;
        }

        public static Row header(String title) {
            return new Row(TYPE_HEADER, title, null);
        }

        public static Row track(Track t) {
            return new Row(TYPE_TRACK, null, t);
        }

        public static Row footer() {
            return new Row(TYPE_FOOTER, null, null);
        }
    }

    private final List<Row> rows = new ArrayList<>();
    private final Callback callback;

    public SearchResultsAdapter(Callback callback) {
        this.callback = callback;
    }

    public void submit(List<Row> newRows, boolean showYtmFooter) {
        rows.clear();
        if (newRows != null) rows.addAll(newRows);
        if (showYtmFooter) rows.add(Row.footer());
        notifyDataSetChanged();
    }

    @Override
    public int getItemViewType(int position) {
        return rows.get(position).type;
    }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inflater = LayoutInflater.from(parent.getContext());
        switch (viewType) {
            case TYPE_HEADER:
                return new HeaderVH(inflater.inflate(R.layout.item_section_header, parent, false));
            case TYPE_FOOTER:
                return new FooterVH(inflater.inflate(R.layout.item_search_footer, parent, false));
            default:
                return new TrackVH(inflater.inflate(R.layout.item_track, parent, false));
        }
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        Row row = rows.get(position);
        if (holder instanceof HeaderVH) {
            ((HeaderVH) holder).title.setText(row.header);
        } else if (holder instanceof FooterVH) {
            // static text; nothing to bind
        } else if (holder instanceof TrackVH) {
            Track t = row.track;
            TrackVH h = (TrackVH) holder;
            h.title.setText(t.title);
            h.subtitle.setText(t.album == null ? t.artist : t.artist + " · " + t.album);
            h.duration.setText(FormatUtils.formatDuration(t.durationMs));
            Glide.with(h.artwork)
                    .load(MediaItemConverter.artworkUri(t))
                    .placeholder(R.drawable.bg_artwork_placeholder)
                    .centerCrop()
                    .into(h.artwork);
            boolean playable = t.id.startsWith("ytm:")
                    || t.id.startsWith("local:")
                    || t.streamUri != null;
            h.itemView.setAlpha(playable ? 1f : 0.55f);
            h.itemView.setOnClickListener(v -> {
                int pos = h.getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION && callback != null) {
                    callback.onRowClick(rows.get(pos).track, pos);
                }
            });
            h.more.setOnClickListener(v -> {
                int pos = h.getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION && callback != null) {
                    callback.onRowMenu(rows.get(pos).track, h.more);
                }
            });
        }
    }

    @Override
    public int getItemCount() {
        return rows.size();
    }

    static class HeaderVH extends RecyclerView.ViewHolder {
        final TextView title;

        HeaderVH(@NonNull View itemView) {
            super(itemView);
            title = itemView.findViewById(R.id.section_header_title);
        }
    }

    static class FooterVH extends RecyclerView.ViewHolder {
        FooterVH(@NonNull View itemView) {
            super(itemView);
        }
    }

    static class TrackVH extends RecyclerView.ViewHolder {
        final ImageView artwork;
        final TextView title;
        final TextView subtitle;
        final TextView duration;
        final ImageButton more;

        TrackVH(@NonNull View itemView) {
            super(itemView);
            artwork = itemView.findViewById(R.id.track_artwork);
            title = itemView.findViewById(R.id.track_title);
            subtitle = itemView.findViewById(R.id.track_subtitle);
            duration = itemView.findViewById(R.id.track_duration);
            more = itemView.findViewById(R.id.track_more);
        }
    }
}
